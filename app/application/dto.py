"""Application DTOs.

Python equivalent of `src/backend/application/dto/index.ts`.

The frontend (React) consumes camelCase JSON, so `JobResponseDTO` and
`QueueStatsDTO` serialize to the exact same field names the original API
returned — preserving the contract.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.domain.entities.image_job import ImageJob


class JobResponseDTO(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    originalName: str
    mimeType: str
    fileSize: int
    prompt: str
    status: str
    outputPath: Optional[str] = None
    errorMessage: Optional[str] = None
    retryCount: int
    createdAt: str
    updatedAt: str
    processingStartedAt: Optional[str] = None
    processingCompletedAt: Optional[str] = None
    processingDurationMs: Optional[int] = None

    @classmethod
    def from_entity(cls, job: ImageJob) -> "JobResponseDTO":
        def iso(dt) -> Optional[str]:
            return dt.isoformat() if dt else None

        return cls(
            id=job.id,
            originalName=job.original_name,
            mimeType=job.mime_type,
            fileSize=job.file_size,
            prompt=job.prompt,
            status=job.status,
            outputPath=job.output_path,
            errorMessage=job.error_message,
            retryCount=job.retry_count,
            createdAt=job.created_at.isoformat(),
            updatedAt=job.updated_at.isoformat(),
            processingStartedAt=iso(job.processing_started_at),
            processingCompletedAt=iso(job.processing_completed_at),
            processingDurationMs=job.processing_duration_ms,
        )


class QueueStatsDTO(BaseModel):
    total: int
    pending: int
    processing: int
    completed: int
    failed: int
    cancelled: int
    isRunning: bool
    isPaused: bool
    currentJobId: Optional[str] = None
    eta: Optional[int] = None             # milliseconds
    progressPercent: int


class UploadResultDTO(BaseModel):
    accepted: list[JobResponseDTO]
    rejected: list[dict]
    totalAccepted: int
    totalRejected: int


class GalleryQueryDTO(BaseModel):
    status: Optional[str] = None
    search: Optional[str] = None
    sortBy: Optional[str] = None
    sortOrder: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None
