"""ImageQueueService — asyncio worker-pool.

CRITICAL REWRITE of `src/backend/application/services/ImageQueueService.ts`.

The Node version `extends EventEmitter` and drove work from a 500 ms
`setInterval` tick loop, firing `processJob` (fire-and-forget) while tracking
`activeWorkers` against `concurrentWorkers`.

This Python version is event-driven instead of poll-driven:

  * A pool of N long-lived worker coroutines (N = concurrentWorkers).
  * Workers atomically *claim* a pending job under an `asyncio.Lock`, so no two
    workers ever take the same job (the Node version's `processingJobIds` set).
  * A `_wake` event replaces the interval timer — emitting it nudges idle
    workers when new jobs arrive or state changes (no busy polling).
  * Retries use exponential backoff: delay = retryDelayMs * 2**(retryCount-1),
    upgrading the original fixed-delay behaviour while preserving the
    "safety-blocked jobs are not retried" rule and the same emitted events.

Emitted events (names preserved 1:1 for the SSE/WS layer and the React client):
  started, paused, resumed, stopped,
  job:started, job:completed, job:failed, job:cancelled, job:retrying,
  jobs:added, stats:updated, queue:complete
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.core.events import EventBus
from app.core.logging import Logger
from app.domain.entities.image_job import ImageJob
from app.domain.interfaces import (
    IFileSystemService,
    IImageJobRepository,
    ImageGenerationRequest,
)
from app.application.dto import QueueStatsDTO


@dataclass
class QueueWorkerConfig:
    concurrent_workers: int = 3
    retry_count: int = 3
    retry_delay_ms: int = 5000
    timeout_ms: int = 120000
    model: str = "gemini-2.0-flash-exp"
    quality: int = 90
    output_dir: str = "./output"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ImageQueueService:
    def __init__(
        self,
        job_repository: IImageJobRepository,
        service_factory,                # ImageGenerationServiceFactory
        file_system_service: IFileSystemService,
        logger: Logger,
        events: EventBus,
        config: Optional[QueueWorkerConfig] = None,
    ) -> None:
        self._jobs = job_repository
        self._factory = service_factory
        self._fs = file_system_service
        self._logger = logger
        self._events = events
        self.config = config or QueueWorkerConfig()

        self._is_running = False
        self._is_paused = False
        self._active_workers = 0
        self._processing_job_ids: set[str] = set()
        self._workers: list[asyncio.Task] = []
        self._claim_lock = asyncio.Lock()
        self._wake = asyncio.Event()
        self._start_time: Optional[datetime] = None
        self._completed_count = 0

    # ── EventEmitter shim ──────────────────────────────────────────────────
    def emit(self, event: str, data=None) -> None:
        self._events.emit(event, data)

    def on(self, event: str, handler) -> None:
        self._events.on(event, handler)

    # ── Config ─────────────────────────────────────────────────────────────
    def update_config(self, **patch) -> None:
        for k, v in patch.items():
            if v is not None and hasattr(self.config, k):
                setattr(self.config, k, v)
        self._logger.info("Queue config updated", self.config.__dict__)

    # ── Lifecycle ──────────────────────────────────────────────────────────
    async def start(self) -> None:
        if self._is_running and not self._is_paused:
            return
        self._is_running = True
        self._is_paused = False
        self._start_time = _now()
        self._logger.info("Queue started")
        self.emit("started")
        self._spawn_workers()
        self._wake.set()

    async def pause(self) -> None:
        self._is_paused = True
        self._logger.info("Queue paused")
        self.emit("paused")

    async def resume(self) -> None:
        if not self._is_running:
            await self.start()
            return
        self._is_paused = False
        self._logger.info("Queue resumed")
        self.emit("resumed")
        self._wake.set()

    async def stop(self) -> None:
        self._is_running = False
        self._is_paused = False
        self._wake.set()  # let workers observe the stopped flag and idle
        self._logger.info("Queue stopped")
        self.emit("stopped")

    async def shutdown(self) -> None:
        """Graceful cancel of all worker tasks (called on app shutdown)."""
        self._is_running = False
        self._wake.set()
        for w in self._workers:
            w.cancel()
        for w in self._workers:
            try:
                await w
            except (asyncio.CancelledError, Exception):
                pass
        self._workers.clear()

    async def cancel_all(self) -> None:
        pending = await self._jobs.find_by_status("pending")
        for job in pending:
            job.mark_as_cancelled()
            await self._jobs.save(job)
            self.emit("job:cancelled", {"jobId": job.id})
        await self.stop()
        self._logger.info("All jobs cancelled")

    async def cancel_job(self, job_id: str) -> None:
        job = await self._jobs.find_by_id(job_id)
        if not job:
            return
        if job.status == "pending":
            job.mark_as_cancelled()
            await self._jobs.save(job)
            self.emit("job:cancelled", {"jobId": job_id})

    # ── Stats ──────────────────────────────────────────────────────────────
    async def get_stats(self) -> QueueStatsDTO:
        counts = await self._jobs.get_stats()
        total = counts.get("total", 0)
        pending = counts.get("pending", 0)
        completed = counts.get("completed", 0)
        failed = counts.get("failed", 0)
        cancelled = counts.get("cancelled", 0)
        processing = counts.get("processing", 0)

        done = completed + failed + cancelled
        progress = round((done / total) * 100) if total > 0 else 0

        eta: Optional[int] = None
        if self._is_running and pending > 0 and self._completed_count > 0 and self._start_time:
            elapsed = (_now() - self._start_time).total_seconds() * 1000
            ms_per_job = elapsed / self._completed_count
            eta = int(pending * ms_per_job)

        current = next(iter(self._processing_job_ids), None)

        return QueueStatsDTO(
            total=total, pending=pending, processing=processing,
            completed=completed, failed=failed, cancelled=cancelled,
            isRunning=self._is_running, isPaused=self._is_paused,
            currentJobId=current, eta=eta, progressPercent=progress,
        )

    # ── Worker pool ────────────────────────────────────────────────────────
    def _spawn_workers(self) -> None:
        # Resize pool to match desired concurrency
        self._workers = [w for w in self._workers if not w.done()]
        desired = self.config.concurrent_workers
        while len(self._workers) < desired:
            self._workers.append(asyncio.create_task(self._worker_loop(len(self._workers))))

    async def _worker_loop(self, worker_id: int) -> None:
        while True:
            if not self._is_running or self._is_paused:
                self._wake.clear()
                await self._wait_for_wake()
                continue

            job = await self._claim_next_job()
            if job is None:
                # Nothing to do — check for whole-queue completion, then idle
                await self._maybe_complete()
                self._wake.clear()
                await self._wait_for_wake()
                continue

            await self._process_job(job)

    async def _wait_for_wake(self) -> None:
        try:
            await asyncio.wait_for(self._wake.wait(), timeout=1.0)
        except asyncio.TimeoutError:
            pass

    async def _claim_next_job(self) -> Optional[ImageJob]:
        async with self._claim_lock:
            if self._active_workers >= self.config.concurrent_workers:
                return None
            pending = await self._jobs.find_by_status("pending")
            for job in pending:
                if job.id not in self._processing_job_ids:
                    job.mark_as_processing()
                    await self._jobs.save(job)
                    self._processing_job_ids.add(job.id)
                    self._active_workers += 1
                    return job
            return None

    async def _maybe_complete(self) -> None:
        if self._active_workers > 0:
            return
        processing = await self._jobs.find_by_status("processing")
        pending = await self._jobs.find_by_status("pending")
        if not processing and not pending and self._is_running:
            self.emit("queue:complete")
            await self.stop()

    async def _process_job(self, job: ImageJob) -> None:
        try:
            self.emit("job:started", {"jobId": job.id})
            self._logger.info("Processing job", {"jobId": job.id, "filename": job.original_name})

            image_buffer = await self._fs.read_image_as_buffer(job.original_path)
            service = self._factory.get_service(job.provider)

            result = await asyncio.wait_for(
                service.generate_image(
                    ImageGenerationRequest(
                        image_buffer=image_buffer,
                        mime_type=job.mime_type,
                        prompt=job.prompt,
                        model=self.config.model,
                        quality=self.config.quality,
                    )
                ),
                timeout=self.config.timeout_ms / 1000,
            )

            output_path = await self._fs.save_generated_image(
                result.image_buffer, job.original_name, result.mime_type,
                self.config.output_dir, "Generated",
            )

            job.mark_as_completed(output_path)
            await self._jobs.save(job)
            self._completed_count += 1
            self._logger.info(
                "Job completed",
                {"jobId": job.id, "outputPath": output_path, "durationMs": job.processing_duration_ms},
            )
            self.emit("job:completed", {"jobId": job.id, "outputPath": output_path})

        except Exception as error:  # noqa: BLE001 — error normalization happens here
            message = "Timed out" if isinstance(error, asyncio.TimeoutError) else str(error)
            self._logger.error("Job failed", error, {"jobId": job.id})

            job.increment_retry()
            safety_blocked = "safety" in message.lower()

            if job.can_retry(self.config.retry_count) and not safety_blocked:
                job.status = "pending"
                job.updated_at = _now()
                await self._jobs.save(job)
                self._logger.info("Job queued for retry", {"jobId": job.id, "retryCount": job.retry_count})
                backoff = self.config.retry_delay_ms * (2 ** max(0, job.retry_count - 1))
                asyncio.create_task(self._emit_retry_after(job.id, job.retry_count, backoff))
            else:
                job.mark_as_failed(message)
                await self._jobs.save(job)
                try:
                    await self._fs.save_failed_record(job.id, message, self.config.output_dir)
                except Exception:
                    pass
                self.emit("job:failed", {"jobId": job.id, "error": message})

        finally:
            self._active_workers -= 1
            self._processing_job_ids.discard(job.id)
            try:
                stats = await self.get_stats()
                self.emit("stats:updated", stats.model_dump())
            except Exception:
                pass
            self._wake.set()  # nudge the pool to pick up the next job immediately

    async def _emit_retry_after(self, job_id: str, retry_count: int, delay_ms: int) -> None:
        await asyncio.sleep(delay_ms / 1000)
        self.emit("job:retrying", {"jobId": job_id, "retryCount": retry_count})
        self._wake.set()

    # ── Job creation / ingestion ───────────────────────────────────────────
    async def add_jobs(self, jobs: list[ImageJob]) -> None:
        for job in jobs:
            await self._jobs.save(job)
        self.emit("jobs:added", {"count": len(jobs)})
        self._wake.set()

    def create_job(
        self, *, original_path: str, original_name: str, mime_type: str,
        file_size: int, prompt: str, job_id: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> ImageJob:
        return ImageJob(
            id=job_id or str(uuid.uuid4()),
            original_path=original_path,
            original_name=original_name,
            mime_type=mime_type,
            file_size=file_size,
            prompt=prompt,
            status="pending",
            provider=provider,
            retry_count=0,
        )
