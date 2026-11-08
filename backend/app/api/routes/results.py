"""Safe retrieval of generated image outputs."""

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.services.file_service import get_managed_output

router = APIRouter(prefix="/results", tags=["results"])


@router.get("/{name}")
def get_result(name: str, request: Request) -> FileResponse:
    output = get_managed_output(request.app.state.settings, name)
    media_type = "video/mp4" if output.suffix == ".mp4" else "image/jpeg"
    return FileResponse(output, media_type=media_type, filename=name)
