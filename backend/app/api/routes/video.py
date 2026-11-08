"""Recorded-video submission endpoint."""

from fastapi import APIRouter, File, Query, Request, UploadFile

from app.errors import ApiError
from app.services.video_service import VideoJobManager

router = APIRouter(prefix="/detect", tags=["detection"])


@router.post("/video", status_code=202)
def detect_video(
    request: Request,
    file: UploadFile = File(...),
    confidence: float | None = Query(default=None),
) -> dict[str, int | str]:
    settings = request.app.state.settings
    threshold = settings.default_confidence if confidence is None else confidence
    if not settings.min_confidence <= threshold <= settings.max_confidence:
        raise ApiError(
            422,
            "invalid_confidence",
            f"Confidence must be between {settings.min_confidence:.2f} and {settings.max_confidence:.2f}.",
        )
    manager: VideoJobManager = request.app.state.video_jobs
    inspection_id = manager.start(upload_stream=file.file, upload_name=file.filename, confidence=threshold)
    return {"inspection_id": inspection_id, "status": "queued"}
