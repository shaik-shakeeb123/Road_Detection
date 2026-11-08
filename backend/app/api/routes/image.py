"""Image upload and synchronous detection endpoint."""

from __future__ import annotations

from fastapi import APIRouter, File, Query, Request, UploadFile

from app.errors import ApiError
from app.schemas import DetectionResponse, ImageDetectionResponse
from app.services.image_service import ImageDetectionService

router = APIRouter(prefix="/detect", tags=["detection"])


@router.post("/image", response_model=ImageDetectionResponse)
def detect_image(
    request: Request,
    file: UploadFile = File(...),
    confidence: float | None = Query(default=None),
) -> ImageDetectionResponse:
    settings = request.app.state.settings
    threshold = settings.default_confidence if confidence is None else confidence
    if not settings.min_confidence <= threshold <= settings.max_confidence:
        raise ApiError(
            422,
            "invalid_confidence",
            f"Confidence must be between {settings.min_confidence:.2f} and {settings.max_confidence:.2f}.",
        )
    service = ImageDetectionService(settings, request.app.state.model_manager)
    result = service.detect(upload_stream=file.file, upload_name=file.filename, confidence=threshold)
    return ImageDetectionResponse(
        inspection_id=result.inspection_id,
        status="completed",
        model=result.model,
        total_detections=result.total_detections,
        class_counts=result.class_counts,
        detections=[
            DetectionResponse(
                class_id=detection.class_id,
                class_name=detection.class_name,
                confidence=detection.confidence,
                box=list(detection.bbox),
            )
            for detection in result.detections
        ],
        processing_time=result.processing_time,
        annotated_image_url=f"/api/results/{result.output_name}",
    )
