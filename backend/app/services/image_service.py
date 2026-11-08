"""Synchronous image detection orchestration shared by the image API route."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

from app.config import Settings
from app.database.inspections import complete_image_inspection, create_image_inspection, fail_inspection
from app.errors import ApiError
from app.services.file_service import (
    accepted_image_extension,
    display_name,
    new_upload_path,
    save_upload,
    validate_image,
    write_annotated_jpeg,
)
from app.services.inference_service import ImageInferenceProvider, InferenceFailed, ModelUnavailable

log = logging.getLogger("roadvision.image")


@dataclass(frozen=True, slots=True)
class ImageInspectionResult:
    inspection_id: int
    model: str
    total_detections: int
    class_counts: dict[str, int]
    detections: tuple[Any, ...]
    processing_time: float
    output_name: str


class ImageDetectionService:
    def __init__(self, settings: Settings, inference: ImageInferenceProvider) -> None:
        self._settings = settings
        self._inference = inference

    def detect(
        self,
        *,
        upload_stream: BinaryIO,
        upload_name: str | None,
        confidence: float,
    ) -> ImageInspectionResult:
        extension = accepted_image_extension(upload_name)
        temporary_path = new_upload_path(self._settings, extension)
        inspection_id: int | None = None
        output_name: str | None = None
        started = time.perf_counter()
        try:
            save_upload(
                upload_stream,
                temporary_path,
                max_bytes=self._settings.image_max_bytes,
                chunk_bytes=self._settings.upload_chunk_bytes,
                size_error_message="The uploaded file exceeds the 20 MB image limit.",
            )
            image = validate_image(temporary_path, self._settings)
            inspection_id = create_image_inspection(
                self._settings, filename=display_name(upload_name), confidence=confidence
            )
            try:
                inference_result = self._inference.detect_image(image, confidence)
            except ModelUnavailable:
                fail_inspection(self._settings, inspection_id, "No validated RoadVision model is available.")
                raise ApiError(503, "model_unavailable", "No validated RoadVision model is available.") from None
            except InferenceFailed:
                fail_inspection(self._settings, inspection_id, "Image inference failed.")
                raise ApiError(500, "inference_failed", "Image inference failed.") from None
            except Exception:
                log.exception("Unexpected image inference failure")
                fail_inspection(self._settings, inspection_id, "Image inference failed.")
                raise ApiError(500, "inference_failed", "Image inference failed.") from None

            output_name = write_annotated_jpeg(self._settings, inference_result.annotated_image)
            processing_ms = round((time.perf_counter() - started) * 1000)
            complete_image_inspection(
                self._settings,
                inspection_id,
                model=inference_result.model,
                total_detections=len(inference_result.detections),
                class_counts=inference_result.class_counts,
                processing_ms=processing_ms,
                output_name=output_name,
            )
            return ImageInspectionResult(
                inspection_id=inspection_id,
                model=inference_result.model,
                total_detections=len(inference_result.detections),
                class_counts=inference_result.class_counts,
                detections=inference_result.detections,
                processing_time=processing_ms / 1000,
                output_name=output_name,
            )
        except ApiError:
            raise
        except Exception:
            log.exception("Image processing failed")
            if inspection_id is not None:
                fail_inspection(self._settings, inspection_id, "Image processing failed.")
            if output_name is not None:
                (self._settings.outputs_dir / output_name).unlink(missing_ok=True)
            raise ApiError(500, "image_processing_failed", "Image processing failed.") from None
        finally:
            temporary_path.unlink(missing_ok=True)
