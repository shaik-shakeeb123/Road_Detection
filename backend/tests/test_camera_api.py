"""Live-camera API tests using explicit fake camera and inference implementations.

These are simulated hardware tests. Physical webcam/USB-camera verification remains a
manual acceptance test on the Windows demonstration machine.
"""

from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
from fastapi.testclient import TestClient

from app.config import Settings
from app.api.routes.camera import stream_camera
from app.main import create_app
from app.services.camera_service import CameraService
from app.services.inference_service import Detection, InferenceFailed, InferenceResult
from app.services.job_slot import JobSlot
from app.services.video_service import VideoJobManager


class FakeCapture:
    """Thread-safe test capture that produces in-memory BGR frames only."""

    def __init__(self, *, opened: bool = True, fail_reads: bool = False, delay: float = 0.005) -> None:
        self.opened = opened
        self.fail_reads = fail_reads
        self.delay = delay
        self.released = False
        self.read_count = 0

    def isOpened(self) -> bool:
        return self.opened

    def read(self) -> tuple[bool, Any]:
        if self.delay:
            time.sleep(self.delay)
        self.read_count += 1
        if self.fail_reads:
            return False, None
        return True, np.full((12, 16, 3), self.read_count % 255, dtype=np.uint8)

    def release(self) -> None:
        self.released = True
        self.opened = False


class FakeCameraInference:
    """Explicit test-only provider; it does not make real YOLO predictions."""

    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.calls = 0

    def startup(self) -> None:
        pass

    def status(self) -> dict[str, bool]:
        return {"available": True}

    def detect_frame(self, frame: Any, _confidence: float) -> InferenceResult:
        self.calls += 1
        if self.fail:
            raise InferenceFailed("injected test failure")
        detections = (Detection(3, "D40", 0.9, (1.0, 1.0, 10.0, 10.0)),)
        return InferenceResult(model="TEST-MOCK", detections=detections, annotated_image=frame.copy())


def mocked_camera_app(
    tmp_path: Path,
    inference: FakeCameraInference,
    capture: FakeCapture,
    **settings_changes: Any,
) -> tuple[Any, Settings, JobSlot]:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data", **settings_changes)
    app = create_app(settings)
    slot = JobSlot()
    app.state.model_manager = inference
    app.state.job_slot = slot
    app.state.camera_service = CameraService(settings, inference, slot, lambda _index: capture)
    app.state.video_jobs = VideoJobManager(settings, inference, slot)
    return app, settings, slot


def wait_for_final(client: TestClient, inspection_id: int, timeout: float = 3) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/history/{inspection_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in {"completed", "failed", "cancelled"}:
            return payload
        time.sleep(0.02)
    raise AssertionError("camera session did not finish")


def test_camera_start_mjpeg_frame_and_stop_persist_aggregate(tmp_path: Path) -> None:
    capture = FakeCapture()
    app, settings, _ = mocked_camera_app(tmp_path, FakeCameraInference(), capture)
    with TestClient(app) as client:
        started = client.post("/api/camera/start")
        assert started.status_code == 200
        inspection_id = started.json()["inspection_id"]
        stream_response = stream_camera(SimpleNamespace(app=app))
        assert stream_response.media_type == "multipart/x-mixed-replace; boundary=frame"
        assert stream_response.headers["content-type"].startswith("multipart/x-mixed-replace; boundary=frame")
        # Service generator underpins the endpoint's StreamingResponse. It proves a valid MJPEG part.
        frame = next(app.state.camera_service.frames())
        assert frame.startswith(b"--frame\r\nContent-Type: image/jpeg\r\n\r\n")
        assert b"\xff\xd8" in frame
        stopped = client.post("/api/camera/stop")
        record = client.get(f"/api/history/{inspection_id}").json()
    assert stopped.status_code == 200
    assert stopped.json() == {"inspection_id": inspection_id, "status": "completed"}
    assert record["input_type"] == "webcam"
    assert record["frames_processed"] >= 1
    assert record["total_detections"] == record["frames_processed"]
    assert record["class_summary"]["D40"] == record["frames_processed"]
    assert record["output_url"] is None
    assert capture.released is True
    assert list(settings.outputs_dir.iterdir()) == []
    with sqlite3.connect(settings.database_path) as con:
        assert con.execute("SELECT COUNT(*) FROM inspections WHERE input_type = 'webcam'").fetchone()[0] == 1


def test_stream_route_rejects_no_active_session_and_stop_is_idempotence_safe(tmp_path: Path) -> None:
    app, _, _ = mocked_camera_app(tmp_path, FakeCameraInference(), FakeCapture())
    with TestClient(app) as client:
        stream = client.get("/api/camera/stream")
        stopped = client.post("/api/camera/stop")
    assert stream.status_code == 409
    assert stream.json()["error"]["code"] == "camera_not_active"
    assert stopped.status_code == 409


def test_camera_initialization_failure_and_unavailable_are_safe(tmp_path: Path) -> None:
    capture = FakeCapture(opened=False)
    app, settings, _ = mocked_camera_app(tmp_path, FakeCameraInference(), capture)
    with TestClient(app) as client:
        response = client.post("/api/camera/start")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "camera_unavailable"
    assert capture.released is True
    with sqlite3.connect(settings.database_path) as con:
        status, error = con.execute("SELECT status, error_message FROM inspections").fetchone()
    assert (status, error) == ("failed", "Camera is unavailable or in use.")


def test_camera_model_unavailable_is_truthful(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    app = create_app(settings)
    with TestClient(app) as client:
        response = client.post("/api/camera/start")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"
    with sqlite3.connect(settings.database_path) as con:
        assert con.execute("SELECT status FROM inspections").fetchone()[0] == "failed"


def test_camera_inference_and_read_failure_release_capture_and_persist_failure(tmp_path: Path) -> None:
    inference_capture = FakeCapture()
    inference_app, _, _ = mocked_camera_app(tmp_path / "inference", FakeCameraInference(fail=True), inference_capture)
    with TestClient(inference_app) as client:
        started = client.post("/api/camera/start")
        failed = wait_for_final(client, started.json()["inspection_id"])
    assert failed["status"] == "failed"
    assert failed["error_message"] == "Camera inference failed."
    assert inference_capture.released is True

    read_capture = FakeCapture(fail_reads=True)
    read_app, _, _ = mocked_camera_app(tmp_path / "read", FakeCameraInference(), read_capture)
    with TestClient(read_app) as client:
        started = client.post("/api/camera/start")
        failed = wait_for_final(client, started.json()["inspection_id"])
    assert failed["status"] == "failed"
    assert failed["error_message"] == "Camera disconnected or could not read a frame."
    assert read_capture.released is True


def test_camera_active_and_video_shared_slot_conflicts(tmp_path: Path) -> None:
    capture = FakeCapture()
    app, _, slot = mocked_camera_app(tmp_path, FakeCameraInference(), capture)
    with TestClient(app) as client:
        started = client.post("/api/camera/start")
        assert started.status_code == 200
        duplicate = client.post("/api/camera/start")
        assert duplicate.status_code == 409
        assert slot.active()[1] == "webcam"
        client.post("/api/camera/stop")

    video_slot = JobSlot()
    assert video_slot.acquire(91, "video")
    blocked_app, _, _ = mocked_camera_app(tmp_path / "video", FakeCameraInference(), FakeCapture())
    blocked_app.state.job_slot = video_slot
    blocked_app.state.camera_service = CameraService(
        blocked_app.state.settings, blocked_app.state.model_manager, video_slot, lambda _index: FakeCapture()
    )
    with TestClient(blocked_app) as client:
        blocked = client.post("/api/camera/start")
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "busy"


def test_watchdog_and_maximum_session_duration_clean_up_camera(tmp_path: Path) -> None:
    # Consume one MJPEG frame, then abandon the generator; the watchdog treats this
    # as a disconnected consumer rather than an initial camera-start failure.
    watchdog_capture = FakeCapture(delay=0.01)
    watchdog_app, _, _ = mocked_camera_app(
        tmp_path / "watchdog", FakeCameraInference(), watchdog_capture, webcam_watchdog_seconds=0.04
    )
    with TestClient(watchdog_app) as client:
        started = client.post("/api/camera/start")
        assert next(watchdog_app.state.camera_service.frames()).startswith(b"--frame\r\n")
        ended = wait_for_final(client, started.json()["inspection_id"])
    assert ended["status"] == "completed"
    assert ended["error_message"] == "Camera stream consumer disconnected."
    assert watchdog_capture.released is True

    duration_capture = FakeCapture(delay=0.01)
    duration_app, _, _ = mocked_camera_app(
        tmp_path / "duration",
        FakeCameraInference(),
        duration_capture,
        webcam_max_seconds=0.04,
        webcam_watchdog_seconds=10,
    )
    with TestClient(duration_app) as client:
        started = client.post("/api/camera/start")
        ended = wait_for_final(client, started.json()["inspection_id"])
    assert ended["status"] == "completed"
    assert ended["error_message"] == "Camera session reached the maximum duration."
    assert duration_capture.released is True


def test_shutdown_releases_active_camera(tmp_path: Path) -> None:
    capture = FakeCapture()
    app, _, _ = mocked_camera_app(tmp_path, FakeCameraInference(), capture)
    with TestClient(app) as client:
        assert client.post("/api/camera/start").status_code == 200
    assert capture.released is True
