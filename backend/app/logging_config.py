"""Local rotating logging without exposing details through the API."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from app.config import Settings


def configure_logging(settings: Settings) -> RotatingFileHandler:
    settings.logs_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("roadvision")
    logger.setLevel(logging.INFO)
    log_path = settings.logs_dir / "roadvision.log"
    if any(getattr(handler, "baseFilename", None) == str(log_path) for handler in logger.handlers):
        return next(handler for handler in logger.handlers if getattr(handler, "baseFilename", None) == str(log_path))
    handler = RotatingFileHandler(log_path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
    return handler


def close_logging_handler(handler: RotatingFileHandler) -> None:
    """Release the Windows file handle during application shutdown."""
    logger = logging.getLogger("roadvision")
    logger.removeHandler(handler)
    handler.close()
