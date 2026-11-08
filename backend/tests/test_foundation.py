from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import ApiError
from app.main import create_app


def test_health_does_not_depend_on_models(tmp_path: Path) -> None:
    app = create_app(Settings(project_root=tmp_path, data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "RoadVision"}


def test_model_status_reports_missing_weights_truthfully(tmp_path: Path) -> None:
    app = create_app(Settings(project_root=tmp_path, data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        response = client.get("/api/model/status")
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False
    assert body["active_model"] is None
    assert body["primary_loaded"] is False
    assert body["fallback_loaded"] is False
    assert body["initialization_errors"] == {
        "YOLO26m": "Model checkpoint is unavailable.",
        "YOLO26n": "Model checkpoint is unavailable.",
    }


def test_restart_recovery_marks_unfinished_work_failed(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    first_app = create_app(settings)
    with TestClient(first_app):
        pass

    import sqlite3

    with sqlite3.connect(settings.database_path) as con:
        con.execute("INSERT INTO inspections (input_type, status) VALUES ('video', 'processing')")

    recovered_app = create_app(settings)
    with TestClient(recovered_app):
        pass

    with sqlite3.connect(settings.database_path) as con:
        status, error = con.execute("SELECT status, error_message FROM inspections").fetchone()
    assert (status, error) == ("failed", "interrupted by restart")


def test_database_initialization_uses_wal_and_creates_runtime_directories(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    app = create_app(settings)
    with TestClient(app):
        pass

    import sqlite3

    with sqlite3.connect(settings.database_path) as con:
        journal_mode = con.execute("PRAGMA journal_mode").fetchone()[0]
    assert journal_mode.lower() == "wal"
    assert settings.uploads_dir.is_dir()
    assert settings.outputs_dir.is_dir()
    assert settings.logs_dir.is_dir()


def test_configuration_preserves_documented_limits_and_class_order(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "data")
    assert settings.default_confidence == 0.25
    assert (settings.min_confidence, settings.max_confidence) == (0.10, 0.90)
    assert settings.image_max_bytes == 20 * 1024 * 1024
    assert settings.image_max_side == 8192
    assert settings.video_max_bytes == 200 * 1024 * 1024
    assert settings.video_max_seconds == 60
    assert settings.video_max_side == 1920
    assert settings.job_timeout_seconds == 600
    assert settings.webcam_max_seconds == 600
    assert settings.webcam_watchdog_seconds == 10


def test_api_errors_have_the_documented_safe_response_shape(tmp_path: Path) -> None:
    app = create_app(Settings(project_root=tmp_path, data_dir=tmp_path / "data"))

    @app.get("/api/test-error")
    def error_endpoint() -> None:
        raise ApiError(409, "busy", "A job is already running.")

    @app.get("/api/test-validation")
    def validation_endpoint(confidence: float) -> dict[str, float]:
        return {"confidence": confidence}

    with TestClient(app) as client:
        response = client.get("/api/test-error")
        validation_response = client.get("/api/test-validation")
    assert response.status_code == 409
    assert response.json() == {"error": {"code": "busy", "message": "A job is already running."}}
    assert validation_response.status_code == 422
    assert validation_response.json() == {
        "error": {"code": "invalid_parameters", "message": "Invalid request parameters."}
    }
