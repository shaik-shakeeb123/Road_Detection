"""The sole backend boundary for Ram's YOLO inference implementation."""

from __future__ import annotations

import logging
import threading
from typing import Any

from app.config import CLASS_CODES, Settings
from app.services.inference_service import Detection, InferenceFailed, InferenceResult, ModelUnavailable

log = logging.getLogger("roadvision.model")


class ModelManager:
    """Loads only validated RoadVision checkpoints and reports their real state."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = threading.RLock()
        self._models: dict[str, Any] = {}
        self._active_model: str | None = None
        self._errors: dict[str, str] = {}
        self._fallback_active = False
        self._inference_lock = threading.Lock()

    def startup(self) -> None:
        with self._lock:
            self._models.clear()
            self._errors.clear()
            self._active_model = None
            self._fallback_active = False
            for name in ("YOLO26m", "YOLO26n"):
                try:
                    self._models[name] = self._load_and_validate(name)
                    if self._active_model is None:
                        self._active_model = name
                        self._fallback_active = name == "YOLO26n"
                except Exception as exc:  # Detailed cause belongs only in the local log.
                    self._errors[name] = self._public_error(exc)
                    log.exception("Model initialization failed for %s", name)

    def _load_and_validate(self, name: str) -> Any:
        path = self._settings.model_path(name)
        if not path.is_file():
            raise FileNotFoundError("checkpoint unavailable")
        try:
            import numpy as np
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("inference dependency unavailable") from exc
        model = YOLO(str(path))
        raw_names = model.names
        names = [raw_names[index] for index in sorted(raw_names)] if isinstance(raw_names, dict) else list(raw_names)
        if tuple(names) != CLASS_CODES:
            raise ValueError("checkpoint class mapping is incompatible")
        model.predict(
            np.zeros((self._settings.image_size, self._settings.image_size, 3), dtype=np.uint8),
            device=self._settings.device,
            imgsz=self._settings.image_size,
            verbose=False,
        )
        return model

    @staticmethod
    def _public_error(exc: Exception) -> str:
        if isinstance(exc, FileNotFoundError):
            return "Model checkpoint is unavailable."
        if isinstance(exc, ValueError):
            return "Model checkpoint class mapping is incompatible."
        if isinstance(exc, RuntimeError) and str(exc) == "inference dependency unavailable":
            return "Inference dependencies are unavailable."
        return "Model initialization failed."

    def status(self) -> dict[str, object]:
        with self._lock:
            return {
                "primary_model": "YOLO26m",
                "fallback_model": "YOLO26n",
                "active_model": self._active_model,
                "primary_loaded": "YOLO26m" in self._models,
                "fallback_loaded": "YOLO26n" in self._models,
                "fallback_active": self._fallback_active,
                "initialization_errors": dict(self._errors),
                "available": self._active_model is not None,
            }

    def detect_image(self, image: Any, confidence: float) -> InferenceResult:
        """Run one shared-model prediction and normalize it for the API layer."""
        with self._lock:
            model_name = self._active_model
            model = self._models.get(model_name) if model_name else None
        if model is None or model_name is None:
            raise ModelUnavailable("no validated RoadVision model is available")

        try:
            return self._predict(model_name, model, image, confidence)
        except Exception as first_error:
            if model_name != "YOLO26m":
                raise InferenceFailed("image inference failed") from first_error
            try:
                return self._predict(model_name, model, image, confidence)
            except Exception as retry_error:
                with self._lock:
                    fallback = self._models.get("YOLO26n")
                    if fallback is not None:
                        self._active_model = "YOLO26n"
                        self._fallback_active = True
                        self._errors["YOLO26m"] = "Image inference failed; fallback activated."
                if fallback is None:
                    raise InferenceFailed("image inference failed") from retry_error
                try:
                    return self._predict("YOLO26n", fallback, image, confidence)
                except Exception as fallback_error:
                    raise InferenceFailed("image inference failed") from fallback_error

    def detect_frame(self, frame: Any, confidence: float) -> InferenceResult:
        """Video frames use the same validated model and inference lock as images."""
        return self.detect_image(frame, confidence)

    def detect_video_frame(self, frame: Any, confidence: float) -> InferenceResult:
        """Predict one video frame without a mid-stream model switch.

        The video service owns TDD trigger F4: it discards partial output and restarts
        the whole job on the fallback, so a completed MP4 uses only one model.
        """
        with self._lock:
            model_name = self._active_model
            model = self._models.get(model_name) if model_name else None
        if model is None or model_name is None:
            raise ModelUnavailable("no validated RoadVision model is available")
        try:
            return self._predict(model_name, model, frame, confidence)
        except Exception as exc:
            raise InferenceFailed("video frame inference failed") from exc

    def switch_video_to_fallback(self, reason: str) -> bool:
        """Activate a validated fallback when the video service requests an F4 restart."""
        with self._lock:
            if self._active_model != "YOLO26m" or "YOLO26n" not in self._models:
                return False
            self._active_model = "YOLO26n"
            self._fallback_active = True
            self._errors["YOLO26m"] = reason
            log.error("Switching video processing to YOLO26n: %s", reason)
            return True

    def switch_camera_to_fallback(self, reason: str) -> bool:
        """Activate the validated fallback for the live-FPS fallback trigger (F5)."""
        with self._lock:
            if self._active_model != "YOLO26m" or "YOLO26n" not in self._models:
                return False
            self._active_model = "YOLO26n"
            self._fallback_active = True
            self._errors["YOLO26m"] = reason
            log.error("Switching live camera processing to YOLO26n: %s", reason)
            return True

    def _predict(self, model_name: str, model: Any, image: Any, confidence: float) -> InferenceResult:
        with self._inference_lock:
            raw_result = model.predict(
                image,
                conf=confidence,
                imgsz=self._settings.image_size,
                device=self._settings.device,
                verbose=False,
            )[0]
        detections: list[Detection] = []
        boxes = raw_result.boxes
        for class_id, confidence_score, bbox in zip(
            boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist(), strict=True
        ):
            index = int(class_id)
            if index < 0 or index >= len(CLASS_CODES):
                raise ValueError("model returned an unsupported class")
            detections.append(
                Detection(
                    class_id=index,
                    class_name=CLASS_CODES[index],
                    confidence=round(float(confidence_score), 4),
                    bbox=tuple(round(float(value), 1) for value in bbox),
                )
            )
        return InferenceResult(
            model=model_name,
            detections=tuple(detections),
            annotated_image=raw_result.plot(),
        )
