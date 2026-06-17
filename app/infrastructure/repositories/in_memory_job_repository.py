"""In-memory job repository.

Python equivalent of `src/backend/infrastructure/queue/InMemoryImageJobRepository.ts`.
An async lock guards the dict so concurrent worker coroutines never race on
the same map mutation.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from app.domain.entities.image_job import ImageJob, JobStatus
from app.domain.interfaces import FindAllOptions, IImageJobRepository


class InMemoryImageJobRepository(IImageJobRepository):
    def __init__(self) -> None:
        self._jobs: dict[str, ImageJob] = {}
        self._lock = asyncio.Lock()

    async def find_by_id(self, job_id: str) -> Optional[ImageJob]:
        return self._jobs.get(job_id)

    async def find_all(self, options: Optional[FindAllOptions] = None) -> list[ImageJob]:
        options = options or FindAllOptions()
        jobs = list(self._jobs.values())

        if options.status:
            jobs = [j for j in jobs if j.status == options.status]
        if options.search:
            needle = options.search.lower()
            jobs = [j for j in jobs if needle in j.original_name.lower()]

        sort_by = options.sort_by or "created_at"
        reverse = (options.sort_order or "desc") == "desc"
        jobs.sort(key=lambda j: getattr(j, sort_by), reverse=reverse)

        offset = options.offset or 0
        if options.limit is not None:
            return jobs[offset:offset + options.limit]
        return jobs[offset:]

    async def find_by_status(self, status: JobStatus) -> list[ImageJob]:
        return [j for j in self._jobs.values() if j.status == status]

    async def save(self, job: ImageJob) -> ImageJob:
        async with self._lock:
            self._jobs[job.id] = job
        return job

    async def delete(self, job_id: str) -> None:
        async with self._lock:
            self._jobs.pop(job_id, None)

    async def delete_all(self) -> None:
        async with self._lock:
            self._jobs.clear()

    async def count(self, status: Optional[JobStatus] = None) -> int:
        if status:
            return sum(1 for j in self._jobs.values() if j.status == status)
        return len(self._jobs)

    async def get_stats(self) -> dict[str, int]:
        jobs = list(self._jobs.values())
        return {
            "total": len(jobs),
            "pending": sum(1 for j in jobs if j.status == "pending"),
            "processing": sum(1 for j in jobs if j.status == "processing"),
            "completed": sum(1 for j in jobs if j.status == "completed"),
            "failed": sum(1 for j in jobs if j.status == "failed"),
            "cancelled": sum(1 for j in jobs if j.status == "cancelled"),
        }
