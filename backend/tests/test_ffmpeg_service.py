"""Local FFmpeg smoke test; no model, camera, or GPU is required."""

from pathlib import Path

import numpy as np

from app.services.ffmpeg_service import FFmpegEncoder


def test_ffmpeg_encoder_creates_h264_mp4(tmp_path: Path) -> None:
    output = tmp_path / "annotated.mp4"
    FFmpegEncoder.verify_available()
    encoder = FFmpegEncoder(output, 16, 16, 5.0)
    encoder.write(np.zeros((16, 16, 3), dtype=np.uint8))
    encoder.write(np.full((16, 16, 3), 255, dtype=np.uint8))
    encoder.close()
    assert output.is_file()
    assert output.stat().st_size > 0
