"""FastAPI application factory and lifecycle management."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import camera, dashboard, health, history, image, model, results, video
from app.services.camera_service import CameraService
from app.config import Settings
from app.database.db import initialize_database
from app.errors import install_exception_handlers
from app.logging_config import close_logging_handler, configure_logging
from app.services.model_manager import ModelManager
from app.services.job_slot import JobSlot
from app.services.video_service import VideoJobManager


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        handler = configure_logging(runtime_settings)
        try:
            initialize_database(runtime_settings)
            app.state.model_manager.startup()
            yield
        finally:
            app.state.camera_service.shutdown()
            app.state.video_jobs.shutdown()
            close_logging_handler(handler)

    app = FastAPI(title="RoadVision API", version="0.1.0", lifespan=lifespan)
    app.state.settings = runtime_settings
    app.state.model_manager = ModelManager(runtime_settings)
    app.state.job_slot = JobSlot()
    app.state.video_jobs = VideoJobManager(runtime_settings, app.state.model_manager, app.state.job_slot)
    app.state.camera_service = CameraService(runtime_settings, app.state.model_manager, app.state.job_slot)
    install_exception_handlers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(model.router, prefix="/api")
    app.include_router(image.router, prefix="/api")
    app.include_router(results.router, prefix="/api")
    app.include_router(video.router, prefix="/api")
    app.include_router(history.router, prefix="/api")
    app.include_router(camera.router, prefix="/api")
    app.include_router(dashboard.router, prefix="/api")








































    return app


app = create_app()
