"""Central configuration for the local-only RoadVision backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Final


CLASS_CODES: Final[tuple[str, str, str, str]] = ("D00", "D10", "D20", "D40")
CLASS_LABELS: Final[dict[str, str]] = {
    "D00": "Longitudinal Crack",
    "D10": "Transverse Crack",
    "D20": "Alligator Crack",
    "D40": "Pothole",
}


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings; values are intentionally local and filesystem based."""

    project_root: Path
    data_dir: Path
    device: str = "0"
    image_size: int = 640
    default_confidence: float = 0.25
    min_confidence: float = 0.10
    max_confidence: float = 0.90
    image_max_bytes: int = 20 * 1024 * 1024
    image_max_side: int = 8192
    video_max_bytes: int = 200 * 1024 * 1024
    video_max_seconds: int = 60
    video_max_side: int = 1920
    job_timeout_seconds: int = 10 * 60
    webcam_max_seconds: int = 10 * 60
    webcam_watchdog_seconds: int = 10
    webcam_min_fps: float = 5.0
    camera_index: int = 0
    upload_chunk_bytes: int = 1024 * 1024

    @classmethod
    def from_environment(cls) -> "Settings":
        project_root = Path(__file__).resolve().parents[2]
        data_dir = Path(os.getenv("ROADVISION_DATA_DIR", str(project_root / "data"))).resolve()
        return cls(
            project_root=project_root,
            data_dir=data_dir,
            device=os.getenv("ROADVISION_DEVICE", "0"),
        )

    @property
    def database_path(self) -> Path:
        return self.data_dir / "db" / "roadvision.sqlite3"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads_tmp"

    @property
    def outputs_dir(self) -> Path:
        return self.data_dir / "outputs"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    def model_path(self, model_name: str) -> Path:
        filenames = {
            "YOLO26m": self.project_root / "weights" / "yolo26m" / "best.pt",
            "YOLO26n": self.project_root / "weights" / "yolo26n" / "best.pt",
        }
        return filenames[model_name]
