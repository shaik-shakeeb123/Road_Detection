from fastapi import APIRouter

from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness check that intentionally does not depend on model availability."""
    return HealthResponse(status="ok", service="RoadVision")
