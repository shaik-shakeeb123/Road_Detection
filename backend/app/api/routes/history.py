"""Minimal inspection polling and cancellation routes for video jobs."""

import logging

from fastapi import APIRouter, Query, Request, Response

from app.api.inspection_responses import inspection_status_response
from app.database.inspections import delete_inspection, get_inspection, list_inspections
from app.errors import ApiError
from app.schemas import InspectionListResponse, InspectionStatusResponse
from app.services.file_service import managed_output_path
from app.services.video_service import VideoJobManager

router = APIRouter(prefix="/history", tags=["history"])
log = logging.getLogger("roadvision.history")


@router.get("", response_model=InspectionListResponse)
def list_history(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> InspectionListResponse:
    inspections = list_inspections(request.app.state.settings, limit=limit, offset=offset)
    return InspectionListResponse(
        items=[inspection_status_response(item) for item in inspections], limit=limit, offset=offset
    )


@router.get("/{inspection_id}", response_model=InspectionStatusResponse)
def get_history_item(inspection_id: int, request: Request) -> InspectionStatusResponse:
    inspection = get_inspection(request.app.state.settings, inspection_id)
    if inspection is None:
        raise ApiError(404, "inspection_not_found", "Inspection not found.")
    return inspection_status_response(inspection)


@router.post("/{inspection_id}/cancel")
def cancel_video_job(inspection_id: int, request: Request) -> dict[str, int | str]:
    inspection = get_inspection(request.app.state.settings, inspection_id)
    if inspection is not None and inspection["input_type"] != "video":
        raise ApiError(409, "job_not_active", "Use the camera stop endpoint for an active camera session.")
    manager: VideoJobManager = request.app.state.video_jobs
    manager.cancel(inspection_id)
    return {"inspection_id": inspection_id, "status": "cancellation_requested"}


@router.delete("/{inspection_id}", status_code=204)
def delete_history_item(inspection_id: int, request: Request) -> Response:
    """Safely delete one inactive inspection and its managed generated output."""
    settings = request.app.state.settings
    inspection = get_inspection(settings, inspection_id)
    if inspection is None:
        raise ApiError(404, "inspection_not_found", "Inspection not found.")
    if inspection["status"] in {"queued", "processing"}:
        raise ApiError(409, "inspection_active", "An active inspection cannot be deleted.")

    output_name = inspection["output_name"]
    if output_name:
        try:
            output_path = managed_output_path(settings, str(output_name))
            if output_path.exists():
                output_path.unlink()
        except ApiError:
            log.error("Inspection %s contains an invalid managed output name", inspection_id)
            raise ApiError(500, "output_cleanup_failed", "Inspection output could not be removed.") from None
        except OSError:
            log.exception("Unable to remove output for inspection %s", inspection_id)
            raise ApiError(500, "output_cleanup_failed", "Inspection output could not be removed.") from None

    try:
        if not delete_inspection(settings, inspection_id):
            raise ApiError(404, "inspection_not_found", "Inspection not found.")
    except ApiError:
        raise
    except Exception:
        log.exception("Unable to delete inspection %s after output cleanup", inspection_id)
        raise ApiError(500, "inspection_delete_failed", "Inspection metadata could not be deleted.") from None
    return Response(status_code=204)
