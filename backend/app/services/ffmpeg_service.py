"""H.264 FFmpeg encoder used exclusively for RoadVision video outputs."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


class FFmpegUnavailable(RuntimeError):
    pass


class FFmpegEncodingError(RuntimeError):
    pass


class FFmpegEncoder:
    """Pipe BGR frames to FFmpeg as a browser-playable H.264 MP4."""

    def __init__(self, output_path: Path, width: int, height: int, fps: float) -> None:
        executable = self.executable()
        self.output_path = output_path
        self._process = subprocess.Popen(
            [
                executable,
                "-y",
                "-loglevel",
                "error",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "bgr24",
                "-s",
                f"{width}x{height}",
                "-r",
                f"{fps:.3f}",
                "-i",
                "-",
                "-an",
                "-vf",
                "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(output_path),
            ],
            stdin=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    @staticmethod
    def executable() -> str:
        try:
            import imageio_ffmpeg
        except ImportError as exc:
            raise FFmpegUnavailable("imageio-ffmpeg is not installed") from exc
        try:
            return imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:
            raise FFmpegUnavailable("FFmpeg executable is unavailable") from exc

    @classmethod
    def verify_available(cls) -> None:
        executable = cls.executable()
        try:
            probe = subprocess.run(
                [executable, "-hide_banner", "-encoders"],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise FFmpegUnavailable("FFmpeg encoder probe failed") from exc
        if probe.returncode != 0 or "libx264" not in probe.stdout:
            raise FFmpegUnavailable("FFmpeg libx264 encoder is unavailable")

    def write(self, frame: Any) -> None:
        if self._process.stdin is None:
            raise FFmpegEncodingError("FFmpeg input pipe is unavailable")
        try:
            self._process.stdin.write(frame.tobytes())
        except (BrokenPipeError, OSError) as exc:
            raise FFmpegEncodingError("FFmpeg failed while encoding video") from exc

    def close(self) -> None:
        if self._process.stdin is not None and not self._process.stdin.closed:
            self._process.stdin.close()
        try:
            return_code = self._process.wait(timeout=120)
        except subprocess.TimeoutExpired as exc:
            self.abort()
            raise FFmpegEncodingError("FFmpeg timed out while finalizing video") from exc
        if return_code != 0 or not self.output_path.is_file() or self.output_path.stat().st_size == 0:
            raise FFmpegEncodingError("FFmpeg did not create a valid output video")

    def abort(self) -> None:
        if self._process.stdin is not None and not self._process.stdin.closed:
            self._process.stdin.close()
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=5)
