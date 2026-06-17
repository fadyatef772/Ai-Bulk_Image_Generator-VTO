"""ImageJob domain entity.

Python equivalent of `src/backend/domain/entities/ImageJob.ts`.
Keeps the same lifecycle methods so the queue service reads identically.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Optional

JobStatus = Literal["pending", "processing", "completed", "failed", "cancelled"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ImageJob:
    id: str
    original_path: str
    original_name: str
    mime_type: str
    file_size: int
    prompt: str
    status: JobStatus = "pending"
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    processing_duration_ms: Optional[int] = None

    # ── State transitions ──────────────────────────────────────────────────
    def mark_as_processing(self) -> None:
        self.status = "processing"
        self.processing_started_at = _now()
        self.updated_at = _now()

    def mark_as_completed(self, output_path: str) -> None:
        self.status = "completed"
        self.output_path = output_path
        self.processing_completed_at = _now()
        if self.processing_started_at:
            delta = self.processing_completed_at - self.processing_started_at
            self.processing_duration_ms = int(delta.total_seconds() * 1000)
        self.updated_at = _now()

    def mark_as_failed(self, error_message: str) -> None:
        self.status = "failed"
        self.error_message = error_message
        self.updated_at = _now()

    def mark_as_cancelled(self) -> None:
        self.status = "cancelled"
        self.updated_at = _now()

    def increment_retry(self) -> None:
        self.retry_count += 1
        self.updated_at = _now()

    def can_retry(self, max_retries: int) -> bool:
        return self.retry_count < max_retries
