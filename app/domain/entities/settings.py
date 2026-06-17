"""Settings domain entity.

Python equivalent of `src/backend/domain/entities/Settings.ts`.
Same field set, defaults, and provider-aware `is_valid()` rules.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

ApiProvider = Literal["gemini", "vertex", "dust"]


@dataclass
class Settings:
    # Provider selection
    apiProvider: ApiProvider = "gemini"

    # Gemini API (direct)
    geminiApiKey: str = ""

    # Vertex AI (Gemini / Imagen via Google Cloud project)
    vertexProjectId: str = ""
    vertexLocation: str = "us-central1"

    # Dust.tt
    dustApiKey: str = ""
    dustWorkspaceId: str = ""
    dustAgentId: str = ""

    # Common
    outputFolder: str = ""
    concurrentWorkers: int = 3
    retryCount: int = 3
    timeoutMs: int = 120000
    imageQuality: int = 90
    model: str = "gemini-2.0-flash-exp"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Settings":
        defaults = asdict(cls())
        merged = {**defaults, **{k: v for k, v in (data or {}).items() if k in defaults}}
        return cls(**merged)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def is_valid(self) -> bool:
        base_valid = (
            len(self.outputFolder) > 0
            and 1 <= self.concurrentWorkers <= 20
            and 0 <= self.retryCount <= 10
            and 10 <= self.imageQuality <= 100
        )
        if not base_valid:
            return False

        if self.apiProvider == "gemini":
            return len(self.geminiApiKey) > 0
        if self.apiProvider == "vertex":
            return len(self.vertexProjectId) > 0 and len(self.vertexLocation) > 0
        if self.apiProvider == "dust":
            return (
                len(self.dustApiKey) > 0
                and len(self.dustWorkspaceId) > 0
                and len(self.dustAgentId) > 0
            )
        return False


DEFAULT_SETTINGS = Settings()
