"""Domain interfaces (Protocols).

Python equivalent of `src/backend/domain/interfaces/index.ts` and
`src/backend/domain/repositories/IImageJobRepository.ts`.

Protocols give us structural typing (duck typing with static checks) — the
clean-architecture equivalent of the original TypeScript interfaces, so the
application layer depends on abstractions, not concrete infrastructure.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable

from app.domain.entities.image_job import ImageJob, JobStatus
from app.domain.entities.settings import Settings


# ── Image generation ───────────────────────────────────────────────────────
@dataclass
class ImageGenerationRequest:
    image_buffer: bytes
    mime_type: str
    prompt: str
    model: str
    quality: int


@dataclass
class ImageGenerationResponse:
    image_buffer: bytes
    mime_type: str
    tokens_used: Optional[int] = None


@runtime_checkable
class IImageGenerationService(Protocol):
    async def generate_image(self, request: ImageGenerationRequest) -> ImageGenerationResponse: ...
    async def validate_credentials(self) -> bool: ...


# ── Filesystem ─────────────────────────────────────────────────────────────
class IFileSystemService(Protocol):
    async def save_generated_image(
        self, image_buffer: bytes, original_name: str, mime_type: str,
        output_dir: str, subfolder: str = "Generated",
    ) -> str: ...
    async def save_failed_record(self, job_id: str, error_message: str, output_dir: str) -> None: ...
    async def ensure_directory_structure(self, base_dir: str) -> None: ...
    async def read_image_as_buffer(self, file_path: str) -> bytes: ...
    async def delete_file(self, file_path: str) -> None: ...
    async def file_exists(self, file_path: str) -> bool: ...
    async def get_file_size(self, file_path: str) -> int: ...
    async def list_files(self, directory: str, extensions: Optional[list[str]] = None) -> list[str]: ...
    async def open_in_explorer(self, path: str) -> None: ...


# ── Settings repository ────────────────────────────────────────────────────
class ISettingsRepository(Protocol):
    async def get(self) -> Settings: ...
    async def save(self, settings: Settings) -> None: ...


# ── Job repository ─────────────────────────────────────────────────────────
@dataclass
class FindAllOptions:
    status: Optional[JobStatus] = None
    limit: Optional[int] = None
    offset: Optional[int] = None
    sort_by: str = "created_at"          # createdAt | updatedAt | originalName
    sort_order: str = "desc"             # asc | desc
    search: Optional[str] = None


class IImageJobRepository(Protocol):
    async def find_by_id(self, job_id: str) -> Optional[ImageJob]: ...
    async def find_all(self, options: Optional[FindAllOptions] = None) -> list[ImageJob]: ...
    async def find_by_status(self, status: JobStatus) -> list[ImageJob]: ...
    async def save(self, job: ImageJob) -> ImageJob: ...
    async def delete(self, job_id: str) -> None: ...
    async def delete_all(self) -> None: ...
    async def count(self, status: Optional[JobStatus] = None) -> int: ...
    async def get_stats(self) -> dict[str, int]: ...
