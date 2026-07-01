"""Composition root / DI container.

Python equivalent of the bootstrap wiring at the top of
`src/backend/server.ts`. Builds one instance of each layer and exposes them to
the FastAPI routers. Created once during the app lifespan.
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional

from app.application.services.queue_service import ImageQueueService, QueueWorkerConfig
from app.application.use_cases.image_use_cases import (
    DeleteJobUseCase,
    GetGalleryUseCase,
    RetryJobUseCase,
    UploadImagesUseCase,
)
from app.core.config import AppConfig, get_config
from app.core.events import EventBus
from app.core.logging import Logger, get_logger
from app.infrastructure.config.json_settings_repository import JsonSettingsRepository
from app.infrastructure.filesystem.filesystem_service import FileSystemService
from app.infrastructure.providers.factory import ImageGenerationServiceFactory
from app.infrastructure.providers.production_pipeline_service import ProductionPipelineService
from app.infrastructure.providers.vertex_vto_service import VirtualTryOnService
from app.infrastructure.repositories.in_memory_job_repository import InMemoryImageJobRepository


class Container:
    def __init__(self) -> None:
        self.config: AppConfig = get_config()
        self.logger: Logger = get_logger(self.config.LOG_DIR, self.config.LOG_LEVEL)
        self.events = EventBus()

        # Infrastructure
        self.settings_repository = JsonSettingsRepository(os.getcwd())
        self.job_repository = InMemoryImageJobRepository()
        self.service_factory = ImageGenerationServiceFactory(self.logger)
        self.filesystem = FileSystemService(self.logger)
        self.vto_service = VirtualTryOnService(self.logger)
        self.pipeline_service = ProductionPipelineService(
            self.logger,
            mockup_service=self.service_factory.get_mockup_service(),
            vto_service=self.vto_service,
        )

        # Application
        self.queue = ImageQueueService(
            self.job_repository,
            self.service_factory,
            self.filesystem,
            self.logger,
            self.events,
            QueueWorkerConfig(
                concurrent_workers=self.config.QUEUE_CONCURRENCY,
                retry_count=self.config.QUEUE_MAX_RETRIES,
                retry_delay_ms=self.config.QUEUE_RETRY_DELAY,
                timeout_ms=self.config.QUEUE_TIMEOUT_MS,
                output_dir=self.config.OUTPUT_DIR,
                quality=self.config.IMAGE_QUALITY,
            ),
        )

        self.upload_use_case = UploadImagesUseCase(self.queue, self.filesystem, self.logger)
        self.get_gallery_use_case = GetGalleryUseCase(self.job_repository)
        self.delete_job_use_case = DeleteJobUseCase(self.job_repository, self.filesystem, self.logger)
        self.retry_job_use_case = RetryJobUseCase(self.job_repository, self.logger, self.queue)

    async def startup(self) -> None:
        """Mirror server.ts bootstrap(): load persisted settings, sync env,
        bind the event loop, ensure output dirs, wire SSE heartbeat."""
        self.events.bind_loop(asyncio.get_running_loop())

        # Push AppConfig defaults into environment so providers can see them
        # (JsonSettingsRepository.sync_env will then overlay any persisted overrides)
        os.environ.setdefault("API_PROVIDER", self.config.API_PROVIDER)
        os.environ.setdefault("GEMINI_API_KEY", self.config.GEMINI_API_KEY)
        os.environ.setdefault("VERTEX_PROJECT_ID", self.config.VERTEX_PROJECT_ID)
        os.environ.setdefault("VERTEX_LOCATION", self.config.VERTEX_LOCATION)
        os.environ.setdefault("DUST_API_KEY", self.config.DUST_API_KEY)
        os.environ.setdefault("DUST_WORKSPACE_ID", self.config.DUST_WORKSPACE_ID)
        os.environ.setdefault("DUST_AGENT_ID", self.config.DUST_AGENT_ID)

        settings = await self.settings_repository.get()
        self.settings_repository.sync_env(settings)

        if settings.outputFolder:
            try:
                await self.filesystem.ensure_directory_structure(settings.outputFolder)
            except Exception:
                pass

        self.logger.info("Server starting", {
            "env": self.config.NODE_ENV,
            "port": self.config.PORT,
            "provider": settings.apiProvider or "gemini",
        })

        # Heartbeat: push stats every 2s to connected SSE clients (server.ts setInterval)
        self._heartbeat_task = asyncio.create_task(self._heartbeat())

    async def _heartbeat(self) -> None:
        while True:
            await asyncio.sleep(2)
            if self.events.subscriber_count > 0:
                try:
                    stats = await self.queue.get_stats()
                    self.events.emit("stats", stats.model_dump())
                except Exception:
                    pass

    async def shutdown(self) -> None:
        task = getattr(self, "_heartbeat_task", None)
        if task:
            task.cancel()
        await self.queue.shutdown()


_container: Optional[Container] = None


def get_container() -> Container:
    global _container
    if _container is None:
        _container = Container()
    return _container
