"""JSON settings repository.

Python equivalent of `src/backend/infrastructure/config/JsonSettingsRepository.ts`.
Persists settings to `settings.json`, caches in memory, and hot-injects all
provider credentials into `os.environ` on save and on load (so provider
services read fresh credentials without a restart).
"""
from __future__ import annotations

import json
import os
from typing import Optional

import aiofiles

from app.domain.entities.settings import DEFAULT_SETTINGS, Settings
from app.domain.interfaces import ISettingsRepository


class JsonSettingsRepository(ISettingsRepository):
    def __init__(self, data_dir: Optional[str] = None) -> None:
        self._path = os.path.join(data_dir or os.getcwd(), "settings.json")
        self._cache: Optional[Settings] = None

    async def get(self) -> Settings:
        if self._cache is not None:
            return self._cache
        try:
            if os.path.exists(self._path):
                async with aiofiles.open(self._path, "r", encoding="utf-8") as f:
                    data = json.loads(await f.read())
                self._cache = Settings.from_dict(data)
            else:
                self._cache = Settings.from_dict(DEFAULT_SETTINGS.to_dict())
        except Exception:
            self._cache = Settings.from_dict(DEFAULT_SETTINGS.to_dict())
        return self._cache

    async def save(self, settings: Settings) -> None:
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
        async with aiofiles.open(self._path, "w", encoding="utf-8") as f:
            await f.write(json.dumps(settings.to_dict(), indent=2))
        self._cache = settings
        self._sync_env(settings)

    def invalidate_cache(self) -> None:
        self._cache = None

    @staticmethod
    def _sync_env(settings: Settings) -> None:
        provider = settings.apiProvider or "gemini"
        if settings.geminiApiKey:
            os.environ["GEMINI_API_KEY"] = settings.geminiApiKey
        if settings.vertexProjectId:
            os.environ["VERTEX_PROJECT_ID"] = settings.vertexProjectId
        if settings.vertexLocation:
            os.environ["VERTEX_LOCATION"] = settings.vertexLocation
        if settings.dustApiKey:
            os.environ["DUST_API_KEY"] = settings.dustApiKey
        if settings.dustWorkspaceId:
            os.environ["DUST_WORKSPACE_ID"] = settings.dustWorkspaceId
        if settings.dustAgentId:
            os.environ["DUST_AGENT_ID"] = settings.dustAgentId
        os.environ["API_PROVIDER"] = provider

    def sync_env(self, settings: Settings) -> None:
        """Public wrapper used at startup to push persisted creds into env."""
        self._sync_env(settings)
