"""Application configuration.

Python equivalent of `src/backend/infrastructure/config/index.ts`.
Loads from environment / `.env` and validates with Pydantic (the Zod replacement).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ApiProvider = Literal["gemini", "vertex", "dust"]


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    PORT: int = 3001
    NODE_ENV: Literal["development", "production", "test"] = "development"

    # Provider selection
    API_PROVIDER: ApiProvider = "gemini"

    # Gemini (direct)
    GEMINI_API_KEY: str = ""

    # Vertex AI — auth is ADC-based (Application Default Credentials)
    # Override via env VERTEX_PROJECT_ID — the default is a dev placeholder.
    VERTEX_PROJECT_ID: str = ""
    VERTEX_LOCATION: str = "us-central1"

    # Dust.tt
    DUST_API_KEY: str = ""
    DUST_WORKSPACE_ID: str = ""
    DUST_AGENT_ID: str = ""

    # Redis (optional — only used when QUEUE_BACKEND=redis)
    QUEUE_BACKEND: Literal["memory", "redis"] = "memory"
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""

    # Queue / processing
    QUEUE_CONCURRENCY: int = 3
    QUEUE_MAX_RETRIES: int = 3
    QUEUE_RETRY_DELAY: int = 5000          # ms (base for exponential backoff)
    QUEUE_TIMEOUT_MS: int = 120000
    OUTPUT_DIR: str = "./output"
    MAX_FILE_SIZE_MB: int = 20
    LOG_LEVEL: str = "info"
    LOG_DIR: str = "./logs"
    IMAGE_QUALITY: int = 90
    MAX_DIMENSION: int = 4096

    # VTO (Virtual Try-On) — Vertex model id
    VTO_MODEL: str = "virtual-try-on-001"

    # CORS — comma-separated. Override in production via env:
    #   CORS_ORIGINS=https://your-app.vercel.app
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3001"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_config() -> AppConfig:
    return AppConfig()
