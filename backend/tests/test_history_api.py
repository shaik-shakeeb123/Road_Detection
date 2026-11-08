"""Inspection-history management tests using temporary SQLite and managed output folders."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def history_app(tmp_path: Path) -> tuple[object, Settings]:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    return create_app(settings), settings


def insert_inspection(
    settings: Settings,
    *,
    input_type: str,
    status: str = "completed",
    output_name: str | None = None,
    models_used: str | None = "YOLO26m",
    total_detections: int = 3,
    frames_total: int | None = None,
    frames_processed: int = 0,
    frames_with_detections: int = 0,
) -> int:
    counts = {"D00": 1, "D10": 0, "D20": 1, "D40": 1}
    with sqlite3.connect(settings.database_path) as con:
        cursor = con.execute(
            "INSERT INTO inspections (input_type, filename, models_used, conf_threshold, nms_mode, "
            "total_detections, class_summary, frames_total, frames_processed, frames_with_detections, "
            "processing_ms, output_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                input_type,
                "road-input.jpg" if input_type == "image" else None,
                models_used,
                0.25,
                "end2end",
                total_detections,
                json.dumps(counts),
                frames_total,
                frames_processed,
                frames_with_detections,
                125,
                output_name,
                status,
            ),
        )
        return int(cursor.lastrowid)


def test_empty_history_returns_a_bounded_page(tmp_path: Path) -> None:
    app, _ = history_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/api/history")
    assert response.status_code == 200
    assert response.json() == {"items": [], "limit": 20, "offset": 0}


def test_history_lists_image_video_and_webcam_with_complete_summaries(tmp_path: Path) -> None:
    app, settings = history_app(tmp_path)
    with TestClient(app) as client:
        image_id = insert_inspection(settings, input_type="image", output_name="20261103_a1b2c3d4.jpg")
        video_id = insert_inspection(
            settings,
            input_type="video",
            output_name="20261103_e5f6g7h8.mp4",
            frames_total=100,
            frames_processed=100,
            frames_with_detections=20,
        )
        webcam_id = insert_inspection(
            settings, input_type="webcam", models_used="YOLO26m, YOLO26n", frames_processed=25
        )
        response = client.get("/api/history")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["id"] for item in items] == [webcam_id, video_id, image_id]
    assert {item["input_type"] for item in items} == {"image", "video", "webcam"}
    image = next(item for item in items if item["id"] == image_id)
    video = next(item for item in items if item["id"] == video_id)
    webcam = next(item for item in items if item["id"] == webcam_id)
    assert image["output_url"] == "/api/results/20261103_a1b2c3d4.jpg"
    assert video["output_url"] == "/api/results/20261103_e5f6g7h8.mp4"
    assert (video["frames_total"], video["frames_processed"], video["frames_with_detections"]) == (100, 100, 20)
    assert webcam["output_url"] is None
    for item in items:
        assert item["class_summary"] == {"D00": 1, "D10": 0, "D20": 1, "D40": 1}


def test_history_pagination_is_newest_first_and_range_checked(tmp_path: Path) -> None:
    app, settings = history_app(tmp_path)
    with TestClient(app) as client:
        ids = [insert_inspection(settings, input_type="image") for _ in range(4)]
        page = client.get("/api/history?limit=2&offset=1")
        invalid_low = client.get("/api/history?limit=0")
        invalid_high = client.get("/api/history?limit=101")
        invalid_offset = client.get("/api/history?offset=-1")
    assert [item["id"] for item in page.json()["items"]] == [ids[2], ids[1]]
    assert page.json()["limit"] == 2
    assert page.json()["offset"] == 1
    for response in (invalid_low, invalid_high, invalid_offset):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_parameters"


def test_individual_history_retrieval_and_missing_id(tmp_path: Path) -> None:
    app, settings = history_app(tmp_path)
    with TestClient(app) as client:
        inspection_id = insert_inspection(
            settings, input_type="video", status="processing", frames_total=50, frames_processed=12
        )
        found = client.get(f"/api/history/{inspection_id}")
        missing = client.get("/api/history/999")
    assert found.status_code == 200
    assert found.json()["status"] == "processing"
    assert found.json()["frames_processed"] == 12
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "inspection_not_found"


@pytest.mark.parametrize(
    ("input_type", "output_name"),
    [
        ("image", "20261103_image0001.jpg"),
        ("video", "20261103_video0001.mp4"),
        ("webcam", None),
    ],
)
def test_delete_completed_inspections_and_managed_outputs(
    tmp_path: Path, input_type: str, output_name: str | None
) -> None:
    app, settings = history_app(tmp_path)
    with TestClient(app) as client:
        inspection_id = insert_inspection(settings, input_type=input_type, output_name=output_name)
        if output_name:
            (settings.outputs_dir / output_name).write_bytes(b"managed output")
        deleted = client.delete(f"/api/history/{inspection_id}")
        missing = client.get(f"/api/history/{inspection_id}")
    assert deleted.status_code == 204
    assert missing.status_code == 404
    if output_name:
        assert not (settings.outputs_dir / output_name).exists()


def test_delete_rejects_active_inspection_and_keeps_metadata(tmp_path: Path) -> None:
    app, settings = history_app(tmp_path)
    with TestClient(app) as client:
        inspection_id = insert_inspection(settings, input_type="video", status="processing")
        response = client.delete(f"/api/history/{inspection_id}")
        retained = client.get(f"/api/history/{inspection_id}")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "inspection_active"
    assert retained.status_code == 200


def test_delete_output_filesystem_failure_keeps_database_record(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, settings = history_app(tmp_path)
    output_name = "20261103_locked0001.jpg"
    with TestClient(app) as client:
        inspection_id = insert_inspection(settings, input_type="image", output_name=output_name)
        output = settings.outputs_dir / output_name
        output.write_bytes(b"managed output")
        original_unlink = Path.unlink

        def deny_unlink(self: Path, *args: object, **kwargs: object) -> None:
            if self == output:
                raise PermissionError("simulated output lock")
            return original_unlink(self, *args, **kwargs)

        monkeypatch.setattr(Path, "unlink", deny_unlink)
        response = client.delete(f"/api/history/{inspection_id}")
        retained = client.get(f"/api/history/{inspection_id}")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "output_cleanup_failed"
    assert retained.status_code == 200
    assert output.exists()


def test_delete_rejects_invalid_stored_output_name_and_never_touches_outside_file(tmp_path: Path) -> None:
    app, settings = history_app(tmp_path)
    outside = tmp_path / "outside.jpg"
    outside.write_bytes(b"do not delete")
    with TestClient(app) as client:
        inspection_id = insert_inspection(settings, input_type="image", output_name="../../outside.jpg")
        response = client.delete(f"/api/history/{inspection_id}")
        retained = client.get(f"/api/history/{inspection_id}")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "output_cleanup_failed"
    assert retained.status_code == 200
    assert outside.read_bytes() == b"do not delete"


def test_delete_missing_inspection_returns_404(tmp_path: Path) -> None:
    app, _ = history_app(tmp_path)
    with TestClient(app) as client:
        response = client.delete("/api/history/999")
    assert response.status_code == 404
