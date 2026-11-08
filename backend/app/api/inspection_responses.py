"""Shared presentation helpers for persisted inspection records."""

from __future__ import annotations

from typing import Mapping

from app.schemas import InspectionStatusResponse


def inspection_status_response(inspection: Mapping[str, object]) -> InspectionStatusResponse:
    """Convert a database record into the documented managed-output response."""
    payload = dict(inspection)
    output_name = payload.pop("output_name", None)
    payload["output_url"] = f"/api/results/{output_name}" if output_name else None
    return InspectionStatusResponse(**payload)
