"""Dashboard statistics tests with isolated SQLite data and mocked model state."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import CLASS_CODES, Settings
from app.main import create_app


def dashboard_app(tmp_path: Path, model_status: dict[str, object] | None = None) -> tuple[object, Settings]:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    app = create_app(settings)
    if model_status is not None:
        app.state.model_manager = _MockModelManager(model_status)
    return app, settings


class _MockModelManager:
    """Test-only manager: it supplies state only and never performs inference."""

    def __init__(self, status: dict[str, object]) -> None:
        self._status = status

    def startup(self) -> None:
        pass

    def status(self) -> dict[str, object]:
        return self._status


def model_state(
    *,
    active_model: str | None = None,
    primary_loaded: bool = False,
    fallback_loaded: bool = False,
    fallback_active: bool = False,
) -> dict[str, object]:
    return {
        "primary_model": "YOLO26m",
        "fallback_model": "YOLO26n",
        "active_model": active_model,
        "primary_loaded": primary_loaded,
        "fallback_loaded": fallback_loaded,
        "fallback_active": fallback_active,
        "initialization_errors": {},
        "available": active_model is not None,
    }


def insert_inspection(
    settings: Settings,
    *,
    input_type: str,
    status: str = "completed",
    total_detections: int = 0,
    class_summary: str | None = None,
    output_name: str | None = None,
    frames_total: int | None = None,
    frames_processed: int = 0,
) -> int:
    summary = class_summary if class_summary is not None else json.dumps({code: 0 for code in CLASS_CODES})
    with sqlite3.connect(settings.database_path) as con:
        cursor = con.execute(
            "INSERT INTO inspections (input_type, models_used, conf_threshold, nms_mode, total_detections, "
            "class_summary, frames_total, frames_processed, processing_ms, output_name, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                input_type,
                "YOLO26m",
                0.25,
                "end2end",
                total_detections,
                summary,
                frames_total,
                frames_processed,
                25,
                output_name,
                status,
            ),
        )
        return int(cursor.lastrowid)


def body(client: TestClient) -> dict[str, object]:
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    return response.json()


def test_empty_dashboard_has_zero_statistics_and_unavailable_model(tmp_path: Path) -> None:
    app, _ = dashboard_app(tmp_path)
    with TestClient(app) as client:
        dashboard = body(client)
    assert dashboard["total_inspections"] == 0
    assert dashboard["total_detections"] == 0
    assert dashboard["class_counts"] == {code: 0 for code in CLASS_CODES}
    assert dashboard["recent_inspections"] == []
    assert dashboard["model_status"]["available"] is False
    assert dashboard["model_status"]["active_model"] is None


def test_dashboard_includes_completed_image_inspections(tmp_path: Path) -> None:
    app, settings = dashboard_app(tmp_path)
    with TestClient(app) as client:
        inspection_id = insert_inspection(
            settings,
            input_type="image",
            total_detections=2,
            class_summary=json.dumps({"D00": 2}),
            output_name="20261104_image0001.jpg",
        )
        dashboard = body(client)
    assert dashboard["total_inspections"] == 1
    assert dashboard["total_detections"] == 2
    assert dashboard["class_counts"] == {"D00": 2, "D10": 0, "D20": 0, "D40": 0}
    assert dashboard["recent_inspections"][0]["id"] == inspection_id
    assert dashboard["recent_inspections"][0]["output_url"] == "/api/results/20261104_image0001.jpg"


def test_dashboard_includes_completed_video_frame_statistics(tmp_path: Path) -> None:
    app, settings = dashboard_app(tmp_path)
    with TestClient(app) as client:
        inspection_id = insert_inspection(
            settings,
            input_type="video",
            total_detections=4,
            class_summary=json.dumps({"D10": 3, "D40": 1}),
            output_name="20261104_video0001.mp4",
            frames_total=12,
            frames_processed=12,
        )
        dashboard = body(client)
    recent = dashboard["recent_inspections"][0]
    assert recent["id"] == inspection_id
    assert (recent["frames_total"], recent["frames_processed"]) == (12, 12)
    assert dashboard["class_counts"] == {"D00": 0, "D10": 3, "D20": 0, "D40": 1}


def test_dashboard_includes_completed_webcam_inspections(tmp_path: Path) -> None:
    app, settings = dashboard_app(tmp_path)
    with TestClient(app) as client:
        inspection_id = insert_inspection(
            settings,
            input_type="webcam",
            total_detections=3,
            class_summary=json.dumps({"D20": 3}),
            frames_processed=7,
        )
        dashboard = body(client)
    recent = dashboard["recent_inspections"][0]
    assert recent["id"] == inspection_id
    assert recent["input_type"] == "webcam"
    assert recent["frames_processed"] == 7
    assert dashboard["class_counts"] == {"D00": 0, "D10": 0, "D20": 3, "D40": 0}


def test_dashboard_counts_sessions_but_only_completed_detection_results(tmp_path: Path) -> None:
    app, settings = dashboard_app(tmp_path)
    with TestClient(app) as client:
        insert_inspection(settings, input_type="image", total_detections=2, class_summary=json.dumps({"D00": 2}))
        insert_inspection(
            settings, input_type="video", status="failed", total_detections=99, class_summary=json.dumps({"D40": 99})
        )
        insert_inspection(
            settings, input_type="webcam", status="processing", total_detections=4, class_summary=json.dumps({"D20": 4})
        )
        dashboard = body(client)
    assert dashboard["total_inspections"] == 3
    assert dashboard["total_detections"] == 2
    assert dashboard["class_counts"] == {"D00": 2, "D10": 0, "D20": 0, "D40": 0}


def test_dashboard_normalizes_missing_and_malformed_legacy_class_summaries(tmp_path: Path) -> None:
    app, settings = dashboard_app(tmp_path)
    with TestClient(app) as client:
        insert_inspection(settings, input_type="image", class_summary=json.dumps({"D10": "3"}))
        insert_inspection(settings, input_type="video", class_summary="not-json")
        insert_inspection(settings, input_type="webcam", class_summary=json.dumps({"D40": "bad", "D00": -5}))
        dashboard = body(client)
    assert dashboard["class_counts"] == {"D00": 0, "D10": 3, "D20": 0, "D40": 0}
    for inspection in dashboard["recent_inspections"]:
        assert set(inspection["class_summary"]) == set(CLASS_CODES)


def test_dashboard_recent_inspections_are_newest_first_and_bounded(tmp_path: Path) -> None:
    app, settings = dashboard_app(tmp_path)
    with TestClient(app) as client:
        ids = [insert_inspection(settings, input_type="image") for _ in range(7)]
        dashboard = body(client)
    assert [item["id"] for item in dashboard["recent_inspections"]] == list(reversed(ids[-5:]))


def test_dashboard_reports_mocked_primary_model_state(tmp_path: Path) -> None:
    app, _ = dashboard_app(
        tmp_path, model_state(active_model="YOLO26m", primary_loaded=True, fallback_loaded=True)
    )
    with TestClient(app) as client:
        dashboard = body(client)
    assert dashboard["model_status"] == model_state(
        active_model="YOLO26m", primary_loaded=True, fallback_loaded=True
    )


def test_dashboard_reports_mocked_fallback_active_state(tmp_path: Path) -> None:
    app, _ = dashboard_app(
        tmp_path, model_state(active_model="YOLO26n", primary_loaded=False, fallback_loaded=True, fallback_active=True)
    )
    with TestClient(app) as client:
        dashboard = body(client)
    assert dashboard["model_status"]["active_model"] == "YOLO26n"
    assert dashboard["model_status"]["fallback_active"] is True
    assert dashboard["model_status"]["fallback_loaded"] is True


def test_dashboard_database_failure_is_a_safe_structured_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, _ = dashboard_app(tmp_path)
    from app.api.routes import dashboard as dashboard_route

    def raise_query_error(*_: object, **__: object) -> object:
        raise sqlite3.DatabaseError("simulated database failure")

    monkeypatch.setattr(dashboard_route, "dashboard_snapshot", raise_query_error)
    with TestClient(app) as client:
        response = client.get("/api/dashboard")
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "dashboard_unavailable", "message": "Dashboard statistics could not be loaded."}
    }


def test_dashboard_matches_history_completed_summaries(tmp_path: Path) -> None:
    app, settings = dashboard_app(tmp_path)
    with TestClient(app) as client:
        insert_inspection(settings, input_type="image", total_detections=1, class_summary=json.dumps({"D00": 1}))
        insert_inspection(settings, input_type="video", total_detections=2, class_summary=json.dumps({"D20": 2}))
        insert_inspection(settings, input_type="webcam", status="failed", total_detections=8, class_summary=json.dumps({"D40": 8}))
        dashboard = body(client)
        history = client.get("/api/history?limit=100").json()["items"]
    completed = [item for item in history if item["status"] == "completed"]
    assert dashboard["total_detections"] == sum(item["total_detections"] for item in completed)
    assert dashboard["class_counts"] == {
        code: sum(item["class_summary"][code] for item in completed) for code in CLASS_CODES
    }
