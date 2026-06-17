"""Image-generation service factory.

Python equivalent of `src/backend/infrastructure/ImageGenerationServiceFactory.ts`.
Resolves the active provider from `API_PROVIDER` (env, hot-updated by the
settings repository) on every job, so provider switches take effect without a
restart.
"""
from __future__ import annotations

import os
from typing import Optional

from app.core.logging import Logger
from app.domain.entities.settings import ApiProvider
from app.domain.interfaces import IImageGenerationService
from app.infrastructure.providers.dust_service import DustService
from app.infrastructure.providers.gemini_service import GeminiService
from app.infrastructure.providers.vertex_imagen_service import VertexImagenService


class ImageGenerationServiceFactory:
    def __init__(self, logger: Logger) -> None:
        self._gemini = GeminiService(logger)
        self._vertex = VertexImagenService(logger)
        self._dust = DustService(logger)

    def get_service(self, provider: Optional[ApiProvider] = None) -> IImageGenerationService:
        active = provider or os.environ.get("API_PROVIDER", "gemini")
        if active == "vertex":
            return self._vertex
        if active == "dust":
            return self._dust
        return self._gemini

    async def validate_provider(self, provider: ApiProvider) -> bool:
        return await self.get_service(provider).validate_credentials()

    def get_gemini_service(self) -> GeminiService:
        return self._gemini
