"""Recorded-video API tests using explicit mock inference and test encoders only."""

from __future__ import annotations

import io
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.ffmpeg_service import FFmpegEncodingError, FFmpegUnavailable
from app.services.inference_service import Detection, InferenceFailed, InferenceResult
from app.services.job_slot import JobSlot
from app.services.video_service import VideoJobManager


def make_video_bytes(
    tmp_path: Path,
    *,
    frame_count: int = 4,
    fps: float = 5.0,
    size: tuple[int, int] = (32, 24),
) -> bytes:
    path = tmp_path / "source.avi"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, size)
    assert writer.isOpened(), "OpenCV test-video writer is unavailable"
    for index in range(frame_count):
        frame = np.full((size[1], size[0], 3), (index * 20) % 256, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return path.read_bytes()


class MockEncoder:
    """Mock-only MP4 writer; it makes no claim to encode H.264."""

    def __init__(self, output_path: Path, _width: int, _height: int, _fps: float) -> None:
        self.output_path = output_path
        self.output_path.write_bytes(b"partial")

    @classmethod
    def verify_available(cls) -> None:
        pass

    def write(self, _frame: Any) -> None:
        pass

    def close(self) -> None:
        self.output_path.write_bytes(b"mock-video-output")

    def abort(self) -> None:
        pass


class UnavailableEncoder(MockEncoder):
    @classmethod
    def verify_available(cls) -> None:
        raise FFmpegUnavailable("test unavailable")


class FailingEncoder(MockEncoder):
    def close(self) -> None:
        raise FFmpegEncodingError("test encoding failure")


class MockVideoInference:
    """Explicit test-only frame provider, not a YOLO implementation."""

    def __init__(self, *, fail: bool = False, block_on_call: int | None = None) -> None:
        self.fail = fail
        self.block_on_call = block_on_call
        self.calls = 0
        self.reached_block = threading.Event()
        self.release = threading.Event()

    def startup(self) -> None:
        pass

    def status(self) -> dict[str, bool]:
        return {"available": True}

    def detect_frame(self, frame: Any, _confidence: float) -> InferenceResult:
        self.calls += 1
        if self.fail:
            raise InferenceFailed("injected test failure")
        if self.block_on_call is not None and self.calls >= self.block_on_call:
            self.reached_block.set()
            assert self.release.wait(3), "test did not release mock inference"
        detections = (Detection(0, "D00", 0.8, (1.0, 1.0, 10.0, 10.0)),)
        return InferenceResult(model="TEST-MOCK", detections=detections, annotated_image=frame.copy())


def mocked_video_app(
    tmp_path: Path,
    inference: MockVideoInference,
    encoder_factory: type[MockEncoder] = MockEncoder,
    **setting_changes: Any,
) -> tuple[Any, Settings]:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data", **setting_changes)
    app = create_app(settings)
    slot = JobSlot()
    app.state.model_manager = inference
    app.state.job_slot = slot
    app.state.video_jobs = VideoJobManager(settings, inference, slot, encoder_factory)
    return app, settings


def upload_video(client: TestClient, payload: bytes, name: str = "road.avi", **params: object):
    return client.post(
        "/api/detect/video",
        params=params,
        files={"file": (name, payload, "application/octet-stream")},
    )


def poll(client: TestClient, inspection_id: int, timeout: float = 3) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/history/{inspection_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in {"completed", "failed", "cancelled"}:
            return payload
        time.sleep(0.02)
    raise AssertionError("video job did not finish in time")


def test_valid_video_upload_returns_202_and_completes_with_mock_inference(tmp_path: Path) -> None:
    app, settings = mocked_video_app(tmp_path, MockVideoInference())
    with TestClient(app) as client:
        response = upload_video(client, make_video_bytes(tmp_path))
        assert response.status_code == 202
        inspection_id = response.json()["inspection_id"]
        status = poll(client, inspection_id)
        result = client.get(status["output_url"])
    assert status["status"] == "completed"
    assert status["frames_total"] == 4
    assert status["frames_processed"] == 4
    assert status["frames_with_detections"] == 4
    assert status["total_detections"] == 4
    assert status["class_summary"] == {"D00": 4, "D10": 0, "D20": 0, "D40": 0}
    assert result.status_code == 200
    assert result.headers["content-type"].startswith("video/mp4")
    assert list(settings.uploads_dir.iterdir()) == []


def test_queued_status_exists_before_worker_processing(tmp_path: Path) -> None:
    inference = MockVideoInference()
    app, _ = mocked_video_app(tmp_path, inference)
    manager = app.state.video_jobs
    original_run = manager._run
    worker_started = threading.Event()
    allow_worker = threading.Event()

    def delayed_run(*args: Any) -> None:
        worker_started.set()
        assert allow_worker.wait(3)
        original_run(*args)

    manager._run = delayed_run  # type: ignore[method-assign]
    with TestClient(app) as client:
        response = upload_video(client, make_video_bytes(tmp_path))
        inspection_id = response.json()["inspection_id"]
        assert worker_started.wait(1)
        assert client.get(f"/api/history/{inspection_id}").json()["status"] == "queued"
        allow_worker.set()
        assert poll(client, inspection_id)["status"] == "completed"


def test_processing_status_and_progress_updates_are_pollable(tmp_path: Path) -> None:
    inference = MockVideoInference(block_on_call=2)
    app, _ = mocked_video_app(tmp_path, inference)
    with TestClient(app) as client:
        response = upload_video(client, make_video_bytes(tmp_path))
        inspection_id = response.json()["inspection_id"]
        assert inference.reached_block.wait(2)
        progress = client.get(f"/api/history/{inspection_id}").json()
        assert progress["status"] == "processing"
        assert progress["frames_processed"] == 1
        assert progress["frames_total"] == 4
        inference.release.set()
        assert poll(client, inspection_id)["status"] == "completed"


def test_video_cancellation_cleans_partial_output_and_updates_status(tmp_path: Path) -> None:
    inference = MockVideoInference(block_on_call=1)
    app, settings = mocked_video_app(tmp_path, inference)
    with TestClient(app) as client:
        response = upload_video(client, make_video_bytes(tmp_path))
        inspection_id = response.json()["inspection_id"]
        assert inference.reached_block.wait(2)
        cancelled = client.post(f"/api/history/{inspection_id}/cancel")
        assert cancelled.status_code == 200
        inference.release.set()
        status = poll(client, inspection_id)
        repeat_cancel = client.post(f"/api/history/{inspection_id}/cancel")
    assert status["status"] == "cancelled"
    assert status["output_url"] is None
    assert repeat_cancel.status_code == 409
    assert list(settings.outputs_dir.iterdir()) == []
    assert list(settings.uploads_dir.iterdir()) == []


def test_unsupported_and_corrupt_videos_are_rejected(tmp_path: Path) -> None:
    app, _ = mocked_video_app(tmp_path, MockVideoInference())
    with TestClient(app) as client:
        unsupported = upload_video(client, b"data", name="road.mov")
        corrupt = upload_video(client, b"not a video", name="road.avi")
    assert unsupported.status_code == 415
    assert unsupported.json()["error"]["code"] == "unsupported_type"
    assert corrupt.status_code == 415
    assert corrupt.json()["error"]["code"] == "unsupported_video"


def test_oversized_video_is_rejected_while_streaming(tmp_path: Path) -> None:
    # A small test-only cap exercises the same bounded streaming code as the 200 MB production cap.
    app, _ = mocked_video_app(tmp_path, MockVideoInference(), video_max_bytes=128)
    oversized = b"x" * 129
    with TestClient(app) as client:
        response = upload_video(client, oversized)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


def test_duration_and_resolution_limits_are_enforced(tmp_path: Path) -> None:
    app, _ = mocked_video_app(tmp_path, MockVideoInference())
    with TestClient(app) as client:
        too_long = upload_video(client, make_video_bytes(tmp_path, frame_count=61, fps=1))
        too_wide = upload_video(client, make_video_bytes(tmp_path, frame_count=1, size=(1922, 8)))
    assert too_long.status_code == 422
    assert too_long.json()["error"]["code"] == "video_duration_exceeded"
    assert too_wide.status_code == 422
    assert too_wide.json()["error"]["code"] == "video_resolution_exceeded"


def test_concurrent_video_and_webcam_slot_conflicts_are_rejected(tmp_path: Path) -> None:
    inference = MockVideoInference(block_on_call=1)
    app, _ = mocked_video_app(tmp_path, inference)
    with TestClient(app) as client:
        first = upload_video(client, make_video_bytes(tmp_path))
        assert first.status_code == 202
        assert inference.reached_block.wait(2)
        second = upload_video(client, make_video_bytes(tmp_path))
        assert second.status_code == 409
        inference.release.set()
        assert poll(client, first.json()["inspection_id"])["status"] == "completed"

    webcam_slot = JobSlot()
    assert webcam_slot.acquire(999, "webcam")
    settings = Settings(project_root=tmp_path / "webcam", data_dir=tmp_path / "webcam" / "data")
    webcam_app = create_app(settings)
    webcam_app.state.model_manager = MockVideoInference()
    webcam_app.state.job_slot = webcam_slot
    webcam_app.state.video_jobs = VideoJobManager(settings, webcam_app.state.model_manager, webcam_slot, MockEncoder)
    with TestClient(webcam_app) as client:
        webcam_conflict = upload_video(client, make_video_bytes(tmp_path))
    assert webcam_conflict.status_code == 409


def test_ffmpeg_unavailable_and_encoding_failure_are_recorded_and_cleaned(tmp_path: Path) -> None:
    unavailable_app, unavailable_settings = mocked_video_app(
        tmp_path / "unavailable", MockVideoInference(), UnavailableEncoder
    )
    with TestClient(unavailable_app) as client:
        unavailable = upload_video(client, make_video_bytes(tmp_path))
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "ffmpeg_unavailable"
    with sqlite3.connect(unavailable_settings.database_path) as con:
        assert con.execute("SELECT status FROM inspections").fetchone()[0] == "failed"

    failing_app, failing_settings = mocked_video_app(tmp_path / "failing", MockVideoInference(), FailingEncoder)
    with TestClient(failing_app) as client:
        accepted = upload_video(client, make_video_bytes(tmp_path))
        failed = poll(client, accepted.json()["inspection_id"])
    assert failed["status"] == "failed"
    assert failed["output_url"] is None
    assert list(failing_settings.outputs_dir.iterdir()) == []


def test_video_model_unavailable_and_inference_failure_are_truthful(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path / "models", data_dir=tmp_path / "models" / "data")
    unavailable_app = create_app(settings)
    with TestClient(unavailable_app) as client:
        unavailable = upload_video(client, make_video_bytes(tmp_path))
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "model_unavailable"

    failing_app, _ = mocked_video_app(tmp_path / "inference", MockVideoInference(fail=True))
    with TestClient(failing_app) as client:
        accepted = upload_video(client, make_video_bytes(tmp_path))
        failed = poll(client, accepted.json()["inspection_id"])
    assert failed["status"] == "failed"
    assert failed["error_message"] == "Video inference failed."


def test_missing_and_non_active_video_cancellation_returns_correct_errors(tmp_path: Path) -> None:
    app, _ = mocked_video_app(tmp_path, MockVideoInference())
    with TestClient(app) as client:
        missing = client.post("/api/history/999/cancel")
    assert missing.status_code == 404
