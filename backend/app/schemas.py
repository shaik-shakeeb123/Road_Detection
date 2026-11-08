"""Stable Pydantic API contracts."""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class ModelStatusResponse(BaseModel):
    primary_model: str
    fallback_model: str
    active_model: str | None
    primary_loaded: bool
    fallback_loaded: bool
    fallback_active: bool
    initialization_errors: dict[str, str]
    available: bool


class DetectionResponse(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    box: list[float]


class ImageDetectionResponse(BaseModel):
    inspection_id: int
    status: str
    model: str
    total_detections: int
    class_counts: dict[str, int]
    detections: list[DetectionResponse]
    processing_time: float
    annotated_image_url: str


class InspectionStatusResponse(BaseModel):
    id: int
    created_at: str
    finished_at: str | None
    input_type: str
    filename: str | None
    models_used: str | None
    conf_threshold: float | None
    total_detections: int
    class_summary: dict[str, int]
    frames_total: int | None
    frames_processed: int
    frames_with_detections: int
    processing_ms: int | None
    output_url: str | None
    status: str
    error_message: str | None


class InspectionListResponse(BaseModel):
    items: list[InspectionStatusResponse]
    limit: int
    offset: int


class DashboardResponse(BaseModel):
    total_inspections: int
    total_detections: int
    class_counts: dict[str, int]
    recent_inspections: list[InspectionStatusResponse]
    model_status: ModelStatusResponse
