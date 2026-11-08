"""Backend-side OpenCV webcam capture and MJPEG publication."""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import Counter, deque
from typing import Any, Callable, Iterator

import cv2

from app.config import CLASS_CODES, Settings
from app.database.inspections import (
    create_webcam_inspection,
    fail_inspection,
    finish_video_inspection,
    get_inspection,
    update_video_progress,
)
from app.errors import ApiError
from app.services.inference_service import FrameInferenceProvider, InferenceFailed, ModelUnavailable
from app.services.job_slot import JobSlot

log = logging.getLogger("roadvision.camera")

CaptureFactory = Callable[[int], Any]


def open_default_camera(index: int) -> Any:
    """Use DirectShow on Windows, where the TDD specifies backend-side capture."""
    if os.name == "nt":
        return cv2.VideoCapture(index, cv2.CAP_DSHOW)
    return cv2.VideoCapture(index)


class CameraService:
    """One synchronized camera session with an in-memory latest MJPEG frame."""

    def __init__(
        self,
        settings: Settings,
        inference: FrameInferenceProvider,
        slot: JobSlot,
        capture_factory: CaptureFactory = open_default_camera,
    ) -> None:
        self._settings = settings
        self._inference = inference
        self._slot = slot
        self._capture_factory = capture_factory
        self._state_lock = threading.RLock()
        self._condition = threading.Condition()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._inspection_id: int | None = None
        self._latest_jpeg: bytes | None = None
        self._last_consumer = 0.0

    def start(self, *, camera_index: int, confidence: float) -> int:
        status_method = getattr(self._inference, "status", None)
        if callable(status_method) and not bool(status_method().get("available", False)):
            inspection_id = create_webcam_inspection(self._settings, confidence=confidence)
            fail_inspection(self._settings, inspection_id, "No validated RoadVision model is available.")
            raise ApiError(503, "model_unavailable", "No validated RoadVision model is available.")

        with self._state_lock:
            if self._inspection_id is not None:
                raise ApiError(409, "busy", "Another video job or camera session is running.")
            inspection_id = create_webcam_inspection(self._settings, confidence=confidence)
            if not self._slot.acquire(inspection_id, "webcam"):
                fail_inspection(self._settings, inspection_id, "Another video job or camera session is running.")
                raise ApiError(409, "busy", "Another video job or camera session is running.")
            capture = self._capture_factory(camera_index)
            if capture is None or not capture.isOpened():
                if capture is not None:
                    capture.release()
                self._slot.release(inspection_id)
                fail_inspection(self._settings, inspection_id, "Camera is unavailable or in use.")
                raise ApiError(503, "camera_unavailable", "Camera is unavailable or in use.")
            self._stop.clear()
            self._latest_jpeg = None
            self._last_consumer = time.monotonic()
            self._inspection_id = inspection_id
            self._thread = threading.Thread(
                target=self._run,
                args=(capture, inspection_id, confidence),
                daemon=True,
                name=f"roadvision-camera-{inspection_id}",
            )
            self._thread.start()
            return inspection_id

    def stop(self) -> dict[str, Any]:
        with self._state_lock:
            inspection_id = self._inspection_id
            worker = self._thread
            if inspection_id is None:
                raise ApiError(409, "camera_not_active", "No camera session is active.")
            self._stop.set()
        if worker is not None:
            worker.join(timeout=5)
        inspection = get_inspection(self._settings, inspection_id)
        if inspection is None:
            raise ApiError(500, "camera_stop_failed", "Camera session could not be finalized.")
        return inspection

    def shutdown(self) -> None:
        with self._state_lock:
            worker = self._thread
            if self._inspection_id is None:
                return
            self._stop.set()
        if worker is not None:
            worker.join(timeout=5)

    def frames(self) -> Iterator[bytes]:
        """Yield only newly published frames; generator closure triggers watchdog cleanup."""
        last_frame: bytes | None = None
        try:
            while not self._stop.is_set():
                with self._condition:
                    self._condition.wait(timeout=1.0)
                    jpeg = self._latest_jpeg
                if jpeg is not None and jpeg is not last_frame:
                    last_frame = jpeg
                    with self._state_lock:
                        if self._inspection_id is None:
                            return
                        self._last_consumer = time.monotonic()
                    yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
        finally:
            # Do not stop immediately: the watchdog distinguishes short stream reconnects
            # from a disconnected consumer and ends the session after its configured interval.
            pass

    def active_inspection_id(self) -> int | None:
        with self._state_lock:
            return self._inspection_id

    def _run(self, capture: Any, inspection_id: int, confidence: float) -> None:
        counts: Counter[str] = Counter({code: 0 for code in CLASS_CODES})
        models_used: list[str] = []
        frames_processed = 0
        frames_with_detections = 0
        status = "completed"
        error_message: str | None = None
        started = time.monotonic()
        frame_times: deque[float] = deque()
        try:
            while not self._stop.is_set():
                now = time.monotonic()
                if now - started > self._settings.webcam_max_seconds:
                    error_message = "Camera session reached the maximum duration."
                    break
                with self._state_lock:
                    inactive_for = now - self._last_consumer
                if inactive_for > self._settings.webcam_watchdog_seconds:
                    error_message = "Camera stream consumer disconnected."
                    break
                readable, frame = capture.read()
                if not readable:
                    status = "failed"
                    error_message = "Camera disconnected or could not read a frame."
                    break
                try:
                    result = self._inference.detect_frame(frame, confidence)
                except ModelUnavailable:
                    status = "failed"
                    error_message = "No validated RoadVision model is available."
                    break
                except InferenceFailed:
                    status = "failed"
                    error_message = "Camera inference failed."
                    break
                if result.model not in models_used:
                    models_used.append(result.model)
                counts.update(result.class_counts)
                frames_processed += 1
                if result.detections:
                    frames_with_detections += 1
                encoded, jpeg = cv2.imencode(".jpg", result.annotated_image, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not encoded:
                    raise RuntimeError("camera frame JPEG encoding failed")
                with self._condition:
                    self._latest_jpeg = jpeg.tobytes()
                    self._condition.notify_all()
                update_video_progress(
                    self._settings,
                    inspection_id,
                    frames_processed=frames_processed,
                    frames_with_detections=frames_with_detections,
                    class_counts=counts,
                )
                frame_times.append(now)
                while frame_times and now - frame_times[0] > 10:
                    frame_times.popleft()
                if (
                    now - started >= 10
                    and len(frame_times) / 10 < self._settings.webcam_min_fps
                    and self._switch_to_fallback_for_low_fps()
                ):
                    models_used.append("YOLO26n")
        except Exception:
            status = "failed"
            error_message = "Camera processing failed."
            log.exception("Camera session %s failed", inspection_id)
        finally:
            try:
                capture.release()
            except Exception:
                log.exception("Unable to release camera for session %s", inspection_id)
            processing_ms = round((time.monotonic() - started) * 1000)
            finish_video_inspection(
                self._settings,
                inspection_id,
                status=status,
                class_counts=counts,
                frames_processed=frames_processed,
                frames_with_detections=frames_with_detections,
                processing_ms=processing_ms,
                models_used=", ".join(models_used) or None,
                error_message=error_message,
            )
            self._slot.release(inspection_id)
            self._stop.set()
            with self._state_lock:
                if self._inspection_id == inspection_id:
                    self._inspection_id = None
                    self._thread = None
            with self._condition:
                self._condition.notify_all()

    def _switch_to_fallback_for_low_fps(self) -> bool:
        switch = getattr(self._inference, "switch_camera_to_fallback", None)
        if not callable(switch):
            return False
        return bool(switch("Live camera FPS remained below the configured threshold."))
