"""Image API tests. Tests labelled mock use a test-only inference provider, never a real model."""

from __future__ import annotations

import io
import json
import sqlite3
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app
from app.services.inference_service import Detection, InferenceFailed, InferenceResult


def image_bytes(image_format: str = "JPEG", size: tuple[int, int] = (16, 12)) -> bytes:
    image = Image.new("RGB", size, color=(12, 34, 56))
    stream = io.BytesIO()
    image.save(stream, format=image_format)
    return stream.getvalue()


class FakeImageInference:
    """Explicitly mock-only provider for isolated backend tests."""

    def __init__(self, detections: tuple[Detection, ...] = (), *, fail: bool = False) -> None:
        self.detections = detections
        self.fail = fail
        self.confidences: list[float] = []

    def startup(self) -> None:
        pass

    def detect_image(self, image: Any, confidence: float) -> InferenceResult:
        self.confidences.append(confidence)
        if self.fail:
            raise InferenceFailed("injected test failure")
        return InferenceResult(model="TEST-MOCK", detections=self.detections, annotated_image=image.copy())


def mocked_app(tmp_path: Path, inference: FakeImageInference) -> tuple[Any, Settings]:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    app = create_app(settings)
    app.state.model_manager = inference
    return app, settings


def upload(client: TestClient, content: bytes, name: str = "road.jpg", **params: object):
    return client.post(
        "/api/detect/image",
        params=params,
        files={"file": (name, content, "application/octet-stream")},
    )


def test_valid_image_upload_mock_returns_complete_four_class_response(tmp_path: Path) -> None:
    detections = (
        Detection(0, "D00", 0.91, (1.0, 2.0, 10.0, 11.0)),
        Detection(3, "D40", 0.88, (3.0, 4.0, 12.0, 15.0)),
    )
    app, _ = mocked_app(tmp_path, FakeImageInference(detections))
    with TestClient(app) as client:
        response = upload(client, image_bytes())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["model"] == "TEST-MOCK"
    assert body["total_detections"] == 2
    assert body["class_counts"] == {"D00": 1, "D10": 0, "D20": 0, "D40": 1}
    assert body["detections"] == [
        {"class_id": 0, "class_name": "D00", "confidence": 0.91, "box": [1.0, 2.0, 10.0, 11.0]},
        {"class_id": 3, "class_name": "D40", "confidence": 0.88, "box": [3.0, 4.0, 12.0, 15.0]},
    ]
    assert body["processing_time"] >= 0
    assert body["annotated_image_url"].startswith("/api/results/")


def test_invalid_extension_is_rejected_before_inference(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = upload(client, image_bytes(), name="road.gif")
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported_type"


def test_spoofed_image_mime_type_is_rejected_by_content_validation(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = upload(client, b"not actually an image", name="road.jpg")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "undecodable_image"


def test_corrupt_image_is_rejected(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = upload(client, b"\x89PNG\r\n\x1a\ntruncated", name="road.png")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "undecodable_image"


def test_oversized_image_upload_is_rejected_while_streaming(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    oversized = b"x" * (20 * 1024 * 1024 + 1)
    with TestClient(app) as client:
        response = upload(client, oversized)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


def test_image_dimension_limit_is_enforced(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = upload(client, image_bytes("PNG", (8193, 1)), name="wide.png")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "image_too_large"


def test_invalid_confidence_threshold_is_rejected(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = upload(client, image_bytes(), confidence=0.09)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_confidence"


def test_valid_confidence_threshold_is_passed_to_mock_inference(tmp_path: Path) -> None:
    inference = FakeImageInference()
    app, _ = mocked_app(tmp_path, inference)
    with TestClient(app) as client:
        response = upload(client, image_bytes(), confidence=0.7)
    assert response.status_code == 200
    assert inference.confidences == [0.7]


def test_zero_detection_response_has_all_documented_counts(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = upload(client, image_bytes())
    assert response.status_code == 200
    assert response.json()["total_detections"] == 0
    assert response.json()["class_counts"] == {"D00": 0, "D10": 0, "D20": 0, "D40": 0}


def test_completed_image_creates_database_record_retrievable_output_and_no_temp_file(tmp_path: Path) -> None:
    app, settings = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = upload(client, image_bytes("PNG"), name="../../road.png")
        assert response.status_code == 200
        body = response.json()
        result = client.get(body["annotated_image_url"])
    assert result.status_code == 200
    assert result.headers["content-type"].startswith("image/jpeg")
    assert list(settings.uploads_dir.iterdir()) == []
    output_name = body["annotated_image_url"].rsplit("/", 1)[1]
    with sqlite3.connect(settings.database_path) as con:
        row = con.execute(
            "SELECT input_type, filename, models_used, conf_threshold, total_detections, class_summary, "
            "processing_ms, output_name, status, error_message FROM inspections"
        ).fetchone()
    assert row[:5] == ("image", "road.png", "TEST-MOCK", 0.25, 0)
    assert json.loads(row[5]) == {"D00": 0, "D10": 0, "D20": 0, "D40": 0}
    assert isinstance(row[6], int)
    assert row[7:] == (output_name, "completed", None)


def test_model_unavailable_returns_503_and_stores_failed_inspection(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    app = create_app(settings)
    with TestClient(app) as client:
        response = upload(client, image_bytes())
    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "model_unavailable", "message": "No validated RoadVision model is available."}
    }
    with sqlite3.connect(settings.database_path) as con:
        status, error = con.execute("SELECT status, error_message FROM inspections").fetchone()
    assert (status, error) == ("failed", "No validated RoadVision model is available.")


def test_mock_inference_failure_is_safe_and_persisted(tmp_path: Path) -> None:
    app, settings = mocked_app(tmp_path, FakeImageInference(fail=True))
    with TestClient(app) as client:
        response = upload(client, image_bytes())
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "inference_failed", "message": "Image inference failed."}}
    assert list(settings.uploads_dir.iterdir()) == []
    with sqlite3.connect(settings.database_path) as con:
        status, error = con.execute("SELECT status, error_message FROM inspections").fetchone()
    assert (status, error) == ("failed", "Image inference failed.")


def test_result_route_blocks_path_traversal(tmp_path: Path) -> None:
    app, _ = mocked_app(tmp_path, FakeImageInference())
    with TestClient(app) as client:
        response = client.get("/api/results/..%2F..%2Fsecret.jpg")
        invalid_name_response = client.get("/api/results/not-managed.png")
    # Starlette rejects encoded slashes at routing time, before the strict managed-name
    # validation can run. Either way, no filesystem path is resolved or exposed.
    assert response.status_code == 404
    assert invalid_name_response.status_code == 400
    assert invalid_name_response.json()["error"]["code"] == "invalid_name"
