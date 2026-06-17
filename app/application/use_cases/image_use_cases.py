"""Image use cases.

Python equivalent of `src/backend/application/use-cases/ImageUseCases.ts`.
Same validation rules, temp-file handling, and DTO shapes.
"""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Optional

import aiofiles

from app.application.dto import GalleryQueryDTO, JobResponseDTO, UploadResultDTO
from app.application.services.queue_service import ImageQueueService
from app.core.errors import NotFoundError, ValidationError
from app.core.logging import Logger
from app.domain.interfaces import FindAllOptions, IFileSystemService, IImageJobRepository

ALLOWED_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20MB

# Map frontend camelCase sort keys → entity snake_case attribute names
_SORT_MAP = {
    "createdAt": "created_at",
    "updatedAt": "updated_at",
    "originalName": "original_name",
    "created_at": "created_at",
    "updated_at": "updated_at",
    "original_name": "original_name",
}


@dataclass
class UploadFile:
    original_name: str
    mime_type: str
    buffer: bytes
    size: int


class UploadImagesUseCase:
    def __init__(self, queue: ImageQueueService, fs: IFileSystemService, logger: Logger) -> None:
        self._queue = queue
        self._fs = fs
        self._logger = logger

    async def execute(self, files: list[UploadFile], prompt: str, output_dir: str) -> UploadResultDTO:
        if not prompt or not prompt.strip():
            raise ValidationError("Prompt is required")
        if not output_dir or not output_dir.strip():
            raise ValidationError("Output directory is required. Please configure it in Settings.")
        if not files:
            raise ValidationError("No files provided")

        await self._fs.ensure_directory_structure(output_dir)
        temp_dir = os.path.join(output_dir, "Temp")
        os.makedirs(temp_dir, exist_ok=True)

        accepted: list[JobResponseDTO] = []
        rejected: list[dict] = []

        for file in files:
            try:
                if file.mime_type not in ALLOWED_MIME_TYPES:
                    rejected.append({
                        "filename": file.original_name,
                        "reason": f"Unsupported file type: {file.mime_type}. Allowed: JPG, PNG, WEBP",
                    })
                    continue
                if file.size > MAX_FILE_SIZE_BYTES:
                    rejected.append({
                        "filename": file.original_name,
                        "reason": f"File too large: {file.size / 1024 / 1024:.1f}MB. Max: 20MB",
                    })
                    continue
                if not file.buffer:
                    rejected.append({
                        "filename": file.original_name,
                        "reason": "File appears to be empty or corrupted",
                    })
                    continue

                temp_filename = f"{uuid.uuid4()}_{file.original_name}"
                temp_path = os.path.join(temp_dir, temp_filename)
                async with aiofiles.open(temp_path, "wb") as f:
                    await f.write(file.buffer)

                job = self._queue.create_job(
                    original_path=temp_path,
                    original_name=file.original_name,
                    mime_type=file.mime_type,
                    file_size=file.size,
                    prompt=prompt.strip(),
                )
                await self._queue.add_jobs([job])
                accepted.append(JobResponseDTO.from_entity(job))
                self._logger.info("Job created", {"jobId": job.id, "filename": file.original_name, "size": file.size})
            except Exception as error:  # noqa: BLE001
                rejected.append({"filename": file.original_name, "reason": f"Failed to process: {error}"})

        return UploadResultDTO(
            accepted=accepted, rejected=rejected,
            totalAccepted=len(accepted), totalRejected=len(rejected),
        )


class GetGalleryUseCase:
    def __init__(self, jobs: IImageJobRepository) -> None:
        self._jobs = jobs

    async def execute(self, query: GalleryQueryDTO) -> dict:
        options = FindAllOptions(
            status=query.status,  # type: ignore[arg-type]
            search=query.search,
            sort_by=_SORT_MAP.get(query.sortBy or "createdAt", "created_at"),
            sort_order=query.sortOrder or "desc",
            limit=query.limit,
            offset=query.offset,
        )
        jobs = await self._jobs.find_all(options)
        total = await self._jobs.count(query.status)  # type: ignore[arg-type]
        return {
            "jobs": [JobResponseDTO.from_entity(j) for j in jobs],
            "total": total,
        }


class DeleteJobUseCase:
    def __init__(self, jobs: IImageJobRepository, fs: IFileSystemService, logger: Logger) -> None:
        self._jobs = jobs
        self._fs = fs
        self._logger = logger

    async def execute(self, job_id: str) -> None:
        job = await self._jobs.find_by_id(job_id)
        if not job:
            raise NotFoundError("Job", job_id)
        if job.output_path and await self._fs.file_exists(job.output_path):
            await self._fs.delete_file(job.output_path)
        await self._jobs.delete(job_id)
        self._logger.info("Job deleted", {"jobId": job_id})


class RetryJobUseCase:
    def __init__(self, jobs: IImageJobRepository, logger: Logger, queue: Optional[ImageQueueService] = None) -> None:
        self._jobs = jobs
        self._logger = logger
        self._queue = queue

    async def execute(self, job_id: str) -> JobResponseDTO:
        job = await self._jobs.find_by_id(job_id)
        if not job:
            raise NotFoundError("Job", job_id)
        if job.status not in ("failed", "cancelled"):
            raise ValidationError("Only failed or cancelled jobs can be retried")

        job.status = "pending"
        job.error_message = None
        job.retry_count = 0
        from datetime import datetime, timezone
        job.updated_at = datetime.now(timezone.utc)
        await self._jobs.save(job)

        # Nudge the worker pool so the requeued job is picked up promptly
        if self._queue is not None:
            self._queue._wake.set()  # noqa: SLF001 — intentional internal wake

        self._logger.info("Job queued for retry", {"jobId": job_id})
        return JobResponseDTO.from_entity(job)
