"""Read-only SQLite-backed dashboard statistics."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from pydantic import ValidationError

from app.api.inspection_responses import inspection_status_response
from app.database.inspections import dashboard_snapshot
from app.errors import ApiError
from app.schemas import DashboardResponse, ModelStatusResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
log = logging.getLogger("roadvision.dashboard")


def _model_status(request: Request) -> ModelStatusResponse:
    """Validate manager state before exposing it through the dashboard contract."""
    try:
        status = ModelStatusResponse(**request.app.state.model_manager.status())
    except (AttributeError, TypeError, ValidationError):
        log.exception("Dashboard model status is unavailable")
        raise ApiError(500, "model_status_unavailable", "Model status could not be loaded.") from None

    # ModelManager normally guarantees this invariant. Keep the dashboard truthful
    # even if an incomplete implementation reports contradictory state.
    if not status.available:
        return status.model_copy(update={"active_model": None, "fallback_active": False})
    if status.active_model is None:
        return status.model_copy(update={"available": False, "fallback_active": False})
    if status.fallback_active and status.active_model != status.fallback_model:
        return status.model_copy(update={"fallback_active": False})
    return status


@router.get("", response_model=DashboardResponse)
def get_dashboard(request: Request) -> DashboardResponse:
    try:
        snapshot = dashboard_snapshot(request.app.state.settings)
    except Exception:
        log.exception("Unable to query dashboard statistics")
        raise ApiError(500, "dashboard_unavailable", "Dashboard statistics could not be loaded.") from None

    return DashboardResponse(
        total_inspections=snapshot["total_inspections"],
        total_detections=snapshot["total_detections"],
        class_counts=snapshot["class_counts"],
        recent_inspections=[inspection_status_response(item) for item in snapshot["recent_inspections"]],
        model_status=_model_status(request),
    )
