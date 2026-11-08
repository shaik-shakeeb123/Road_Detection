"""Threaded, local-only recorded-video detection jobs."""

from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from pathlib import Path
from typing import Any, BinaryIO, Protocol

import cv2

from app.config import CLASS_CODES, Settings
from app.database.inspections import (
    create_video_inspection,
    fail_inspection,
    finish_video_inspection,
    get_inspection,
    mark_video_processing,
    update_video_progress,
)
from app.errors import ApiError
from app.services.ffmpeg_service import FFmpegEncoder, FFmpegEncodingError, FFmpegUnavailable
from app.services.file_service import (
    accepted_video_extension,
    display_name,
    new_upload_path,
    new_video_output_name,
    save_upload,
    validate_video,
)
from app.services.inference_service import FrameInferenceProvider, InferenceFailed, ModelUnavailable
from app.services.job_slot import JobSlot

log = logging.getLogger("roadvision.video")


class Encoder(Protocol):
    @classmethod
    def verify_available(cls) -> None: ...

    def write(self, frame: Any) -> None: ...

    def close(self) -> None: ...

    def abort(self) -> None: ...


class VideoJobManager:
    """Owns background threads, cancellation, and guaranteed resource cleanup."""

    def __init__(
        self,
        settings: Settings,
        inference: FrameInferenceProvider,
        slot: JobSlot,
        encoder_factory: type[Encoder] = FFmpegEncoder,
    ) -> None:
        self._settings = settings
        self._inference = inference
        self._slot = slot
        self._encoder_factory = encoder_factory
        self._threads: dict[int, threading.Thread] = {}
        self._threads_lock = threading.Lock()

    def start(
        self,
        *,
        upload_stream: BinaryIO,
        upload_name: str | None,
        confidence: float,
    ) -> int:
        extension = accepted_video_extension(upload_name)
        source_path = new_upload_path(self._settings, extension)
        inspection_id: int | None = None
        try:
            save_upload(
                upload_stream,
                source_path,
                max_bytes=self._settings.video_max_bytes,
                chunk_bytes=self._settings.upload_chunk_bytes,
                size_error_message="The uploaded file exceeds the 200 MB video limit.",
            )
            width, height, fps, frames_total = validate_video(source_path, self._settings)
            inspection_id = create_video_inspection(
                self._settings,
                filename=display_name(upload_name),
                confidence=confidence,
                frames_total=frames_total,
            )
            status_method = getattr(self._inference, "status", None)
            if callable(status_method) and not bool(status_method().get("available", False)):
                fail_inspection(self._settings, inspection_id, "No validated RoadVision model is available.")
                raise ApiError(503, "model_unavailable", "No validated RoadVision model is available.")
            if not self._slot.acquire(inspection_id, "video"):
                fail_inspection(self._settings, inspection_id, "Another video job or camera session is running.")
                raise ApiError(409, "busy", "Another video job or camera session is running.")
            try:
                self._encoder_factory.verify_available()
            except FFmpegUnavailable:
                fail_inspection(self._settings, inspection_id, "FFmpeg with libx264 is unavailable.")
                self._slot.release(inspection_id)
                raise ApiError(503, "ffmpeg_unavailable", "FFmpeg with libx264 is unavailable.") from None
            worker = threading.Thread(
                target=self._run,
                args=(inspection_id, source_path, width, height, fps, confidence),
                daemon=True,
                name=f"roadvision-video-{inspection_id}",
            )
            with self._threads_lock:
                self._threads[inspection_id] = worker
            worker.start()
            return inspection_id
        except Exception:
            source_path.unlink(missing_ok=True)
            raise

    def cancel(self, inspection_id: int) -> None:
        inspection = get_inspection(self._settings, inspection_id)
        if inspection is None:
            raise ApiError(404, "inspection_not_found", "Inspection not found.")
        if inspection["status"] not in {"queued", "processing"}:
            raise ApiError(409, "job_not_active", "This inspection is not an active video job.")
        if not self._slot.request_cancel(inspection_id):
            raise ApiError(409, "job_not_active", "This inspection is not an active video job.")

    def shutdown(self) -> None:
        inspection_id, _ = self._slot.active()
        if inspection_id is not None:
            self._slot.request_cancel(inspection_id)
        with self._threads_lock:
            threads = list(self._threads.values())
        for worker in threads:
            worker.join(timeout=5)

    def _run(
        self,
        inspection_id: int,
        source_path: Path,
        width: int,
        height: int,
        fps: float,
        confidence: float,
    ) -> None:
        capture: cv2.VideoCapture | None = None
        encoder: Encoder | None = None
        output_path = self._settings.outputs_dir / new_video_output_name()
        counts: Counter[str] = Counter({code: 0 for code in CLASS_CODES})
        frames_processed = 0
        frames_with_detections = 0
        models_used: list[str] = []
        status = "failed"
        error_message: str | None = None
        started = time.perf_counter()
        fallback_restarted = False
        try:
            mark_video_processing(self._settings, inspection_id)
            capture = cv2.VideoCapture(str(source_path))
            if not capture.isOpened():
                raise RuntimeError("video capture could not be opened")
            encoder = self._encoder_factory(output_path, width, height, fps)
            deadline = time.monotonic() + self._settings.job_timeout_seconds
            max_frames = int(self._settings.video_max_seconds * fps) + 1
            while True:
                if self._slot.cancelled(inspection_id):
                    status = "cancelled"
                    error_message = "Video processing was cancelled."
                    break
                if time.monotonic() > deadline:
                    raise TimeoutError("Video processing exceeded the time limit.")
                if frames_processed >= max_frames:
                    raise ValueError("Video frame count exceeds the configured duration limit.")
                readable, frame = capture.read()
                if not readable:
                    status = "completed"
                    break
                detect_frame = getattr(self._inference, "detect_video_frame", self._inference.detect_frame)
                try:
                    result = detect_frame(frame, confidence)
                except InferenceFailed:
                    switch_to_fallback = getattr(self._inference, "switch_video_to_fallback", None)
                    if fallback_restarted or not callable(switch_to_fallback) or not switch_to_fallback(
                        "Video inference failed; restarting the job on YOLO26n."
                    ):
                        raise
                    fallback_restarted = True
                    if capture is not None:
                        capture.release()
                    capture = cv2.VideoCapture(str(source_path))
                    if not capture.isOpened():
                        raise RuntimeError("video capture could not be reopened for fallback")
                    encoder.abort()
                    output_path.unlink(missing_ok=True)
                    encoder = self._encoder_factory(output_path, width, height, fps)
                    counts = Counter({code: 0 for code in CLASS_CODES})
                    frames_processed = 0
                    frames_with_detections = 0
                    models_used = ["YOLO26m"]
                    update_video_progress(
                        self._settings,
                        inspection_id,
                        frames_processed=0,
                        frames_with_detections=0,
                        class_counts=counts,
                    )
                    continue
                if result.model not in models_used:
                    models_used.append(result.model)
                counts.update(result.class_counts)
                frames_processed += 1
                if result.detections:
                    frames_with_detections += 1
                encoder.write(result.annotated_image)
                update_video_progress(
                    self._settings,
                    inspection_id,
                    frames_processed=frames_processed,
                    frames_with_detections=frames_with_detections,
                    class_counts=counts,
                )
            if status == "completed":
                encoder.close()
        except ModelUnavailable:
            status = "failed"
            error_message = "No validated RoadVision model is available."
        except InferenceFailed:
            status = "failed"
            error_message = "Video inference failed."
        except TimeoutError as exc:
            status = "failed"
            error_message = str(exc)
        except (FFmpegEncodingError, FFmpegUnavailable):
            status = "failed"
            error_message = "Video encoding failed."
        except Exception:
            status = "failed"
            log.exception("Video job %s failed", inspection_id)
            error_message = "Video processing failed."
        finally:
            if capture is not None:
                capture.release()
            if encoder is not None and status != "completed":
                try:
                    encoder.abort()
                except Exception:
                    log.exception("Unable to abort encoder for job %s", inspection_id)
            if status != "completed":
                output_path.unlink(missing_ok=True)
            source_path.unlink(missing_ok=True)
            processing_ms = round((time.perf_counter() - started) * 1000)
            finish_video_inspection(
                self._settings,
                inspection_id,
                status=status,
                class_counts=counts,
                frames_processed=frames_processed,
                frames_with_detections=frames_with_detections,
                processing_ms=processing_ms,
                models_used=", ".join(models_used) or None,
                output_name=output_path.name if status == "completed" else None,
                error_message=error_message,
            )
            self._slot.release(inspection_id)
            with self._threads_lock:
                self._threads.pop(inspection_id, None)
