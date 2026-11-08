"""Shared inference contract for API services and Ram's model implementation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.config import CLASS_CODES


@dataclass(frozen=True, slots=True)
class Detection:
    class_id: int
    class_name: str
    confidence: float
    bbox: tuple[float, float, float, float]


@dataclass(frozen=True, slots=True)
class InferenceResult:
    """A normalized, original-pixel-coordinate inference result."""

    model: str
    detections: tuple[Detection, ...]
    annotated_image: Any

    @property
    def class_counts(self) -> dict[str, int]:
        counts = {code: 0 for code in CLASS_CODES}
        for detection in self.detections:
            counts[detection.class_name] += 1
        return counts


class ModelUnavailable(RuntimeError):
    """No validated trained RoadVision model can accept an inference request."""


class InferenceFailed(RuntimeError):
    """A validated model could not complete an inference request."""


class ImageInferenceProvider(Protocol):
    def detect_image(self, image: Any, confidence: float) -> InferenceResult:
        """Return detections and an annotated image, or raise a typed inference error."""


class FrameInferenceProvider(ImageInferenceProvider, Protocol):
    def detect_frame(self, frame: Any, confidence: float) -> InferenceResult:
        """Run the same shared inference contract on one decoded video frame."""
