"""Safe local upload validation and managed output storage."""

from __future__ import annotations

import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

import cv2
from PIL import Image, UnidentifiedImageError

from app.config import Settings
from app.errors import ApiError

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
_VIDEO_EXTENSIONS = {".mp4", ".avi"}
_OUTPUT_NAME = re.compile(r"^[A-Za-z0-9_-]{8,64}\.(jpg|mp4)$")


def display_name(raw_name: str | None) -> str:
    """Retain a safe, display-only form of a client filename."""
    raw_name = (raw_name or "upload").replace("\\", "/")
    base_name = Path(raw_name).name
    safe_name = re.sub(r"[^A-Za-z0-9._ -]", "_", base_name).strip(" .")
    return safe_name[:100] or "upload"


def accepted_image_extension(raw_name: str | None) -> str:
    extension = Path((raw_name or "").replace("\\", "/")).suffix.lower()
    if extension not in _IMAGE_EXTENSIONS:
        raise ApiError(415, "unsupported_type", "Only JPG, JPEG, and PNG images are supported.")
    return extension


def accepted_video_extension(raw_name: str | None) -> str:
    extension = Path((raw_name or "").replace("\\", "/")).suffix.lower()
    if extension not in _VIDEO_EXTENSIONS:
        raise ApiError(415, "unsupported_type", "Only MP4 and AVI videos are supported.")
    return extension


def save_upload(
    stream: BinaryIO,
    destination: Path,
    *,
    max_bytes: int,
    chunk_bytes: int,
    size_error_message: str,
) -> None:
    """Write an upload in bounded chunks and delete it if any write/size check fails."""
    written = 0
    try:
        with destination.open("xb") as output:
            while chunk := stream.read(chunk_bytes):
                written += len(chunk)
                if written > max_bytes:
                    raise ApiError(413, "file_too_large", size_error_message)
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def validate_image(path: Path, settings: Settings) -> Any:
    """Check encoded image content and return a decoded BGR image for inference."""
    try:
        with Image.open(path) as opened:
            image_format = opened.format
            width, height = opened.size
            opened.verify()
        if image_format not in {"JPEG", "PNG"}:
            raise ApiError(415, "unsupported_type", "Only JPG, JPEG, and PNG images are supported.")
        if max(width, height) > settings.image_max_side:
            raise ApiError(422, "image_too_large", "Image dimensions exceed the 8192 pixel limit.")
        decoded = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if decoded is None:
            raise ApiError(400, "undecodable_image", "The uploaded image is invalid or corrupt.")
        return decoded
    except ApiError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError):
        raise ApiError(400, "undecodable_image", "The uploaded image is invalid or corrupt.") from None


def new_upload_path(settings: Settings, extension: str) -> Path:
    return settings.uploads_dir / f"{uuid.uuid4().hex}{extension}"


def validate_video(path: Path, settings: Settings) -> tuple[int, int, float, int]:
    """Verify video decodability, dimensions, frame count, duration, and workspace capacity."""
    capture = cv2.VideoCapture(str(path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frames_total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        readable, _ = capture.read()
    finally:
        capture.release()
    if not readable or fps <= 0 or frames_total <= 0 or width <= 0 or height <= 0:
        raise ApiError(415, "unsupported_video", "The uploaded video is invalid or cannot be decoded.")
    if frames_total / fps > settings.video_max_seconds:
        raise ApiError(422, "video_duration_exceeded", "Video duration exceeds the 60 second limit.")
    if width > settings.video_max_side or height > settings.video_max_side:
        raise ApiError(422, "video_resolution_exceeded", "Video resolution exceeds the 1920 by 1080 limit.")
    available = shutil.disk_usage(settings.data_dir).free
    if available < path.stat().st_size * 2:
        raise ApiError(507, "insufficient_storage", "Insufficient local storage to process this video.")
    return width, height, fps, frames_total


def new_output_name() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{timestamp}_{uuid.uuid4().hex[:16]}.jpg"


def new_video_output_name() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{timestamp}_{uuid.uuid4().hex[:16]}.mp4"


def write_annotated_jpeg(settings: Settings, image: Any) -> str:
    """Atomically write a generated JPEG under the managed output directory."""
    encoded, payload = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not encoded:
        raise RuntimeError("annotated image encoding failed")
    output_name = new_output_name()
    output_path = settings.outputs_dir / output_name
    temporary_path = settings.outputs_dir / f".{output_name}.{uuid.uuid4().hex}.tmp"
    try:
        temporary_path.write_bytes(payload.tobytes())
        temporary_path.replace(output_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        raise
    return output_name


def get_managed_output(settings: Settings, name: str) -> Path:
    """Resolve a generated image/video name without allowing path traversal."""
    candidate = managed_output_path(settings, name)
    if not candidate.is_file():
        raise ApiError(404, "result_not_found", "The requested result is no longer available.")
    return candidate


def managed_output_path(settings: Settings, name: str) -> Path:
    """Validate a managed output name and return its output-directory-only location."""
    if not _OUTPUT_NAME.fullmatch(name):
        raise ApiError(400, "invalid_name", "Invalid result file name.")
    candidate = (settings.outputs_dir / name).resolve()
    if candidate.parent != settings.outputs_dir.resolve():
        raise ApiError(400, "invalid_name", "Invalid result file name.")
    return candidate
