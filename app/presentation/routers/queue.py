"""Queue router.

Preserves:
  GET  /api/queue/stats
  POST /api/queue/start | pause | resume | stop | cancel
"""
from __future__ import annotations

from fastapi import APIRouter

from app.presentation.container import get_container

router = APIRouter(prefix="/api/queue", tags=["queue"])


@router.get("/stats")
async def get_stats():
    c = get_container()
    stats = await c.queue.get_stats()
    return {"success": True, "data": stats.model_dump()}


@router.post("/start")
async def start_queue():
    c = get_container()
    settings = await c.settings_repository.get()
    # Apply current settings before starting (server.ts startQueue behaviour)
    c.queue.update_config(
        model=settings.model,
        quality=settings.imageQuality,
        output_dir=settings.outputFolder,
        concurrent_workers=settings.concurrentWorkers,
        retry_count=settings.retryCount,
        timeout_ms=settings.timeoutMs,
    )
    await c.queue.start()
    return {"success": True, "message": "Queue started"}


@router.post("/pause")
async def pause_queue():
    await get_container().queue.pause()
    return {"success": True, "message": "Queue paused"}


@router.post("/resume")
async def resume_queue():
    await get_container().queue.resume()
    return {"success": True, "message": "Queue resumed"}


@router.post("/stop")
async def stop_queue():
    await get_container().queue.stop()
    return {"success": True, "message": "Queue stopped"}


@router.post("/cancel")
async def cancel_queue():
    await get_container().queue.cancel_all()
    return {"success": True, "message": "Queue cancelled"}
