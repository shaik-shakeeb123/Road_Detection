"""Live backend-camera control and MJPEG streaming routes."""

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from app.errors import ApiError
from app.services.camera_service import CameraService

router = APIRouter(prefix="/camera", tags=["camera"])


@router.post("/start")
def start_camera(
    request: Request,
    camera_index: int | None = Query(default=None, ge=0),
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
    service: CameraService = request.app.state.camera_service
    inspection_id = service.start(camera_index=settings.camera_index if camera_index is None else camera_index, confidence=threshold)
    return {"inspection_id": inspection_id, "status": "processing"}


@router.get("/stream")
def stream_camera(request: Request) -> StreamingResponse:
    service: CameraService = request.app.state.camera_service
    if service.active_inspection_id() is None:
        raise ApiError(409, "camera_not_active", "No camera session is active.")
    return StreamingResponse(service.frames(), media_type="multipart/x-mixed-replace; boundary=frame")


@router.post("/stop")
def stop_camera(request: Request) -> dict[str, int | str]:
    service: CameraService = request.app.state.camera_service
    inspection = service.stop()
    return {"inspection_id": inspection["id"], "status": inspection["status"]}
