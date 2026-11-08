from fastapi import APIRouter, Request

from app.schemas import ModelStatusResponse

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/status", response_model=ModelStatusResponse)
def model_status(request: Request) -> ModelStatusResponse:
    return ModelStatusResponse(**request.app.state.model_manager.status())
