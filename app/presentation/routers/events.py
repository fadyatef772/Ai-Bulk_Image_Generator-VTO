"""Real-time events router.

Replaces Node's `EventEmitter` + SSE block in `server.ts`.

  GET /api/events  — Server-Sent Events (the channel the React client uses)
  GET /api/ws      — WebSocket (added per the migration spec)

Internal queue event names are mapped to the SSE event names the original
server broadcast, so the existing frontend `EventSource` listeners
('stats', 'job:completed', 'job:failed', 'queue:complete', 'queue:started', …)
keep working unchanged.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.presentation.container import get_container

router = APIRouter(tags=["events"])

# Internal queue event → SSE/WS event name (matches server.ts broadcast wiring)
_EVENT_MAP = {
    "stats:updated": "stats",
    "started": "queue:started",
    "paused": "queue:paused",
    "resumed": "queue:resumed",
    "stopped": "queue:stopped",
}


def _map(event: str) -> str:
    return _EVENT_MAP.get(event, event)


@router.get("/api/events")
async def sse_events(request: Request):
    c = get_container()

    async def event_stream():
        # Initial stats immediately on connect (server.ts behaviour)
        try:
            stats = await c.queue.get_stats()
            yield f"event: stats\ndata: {json.dumps(stats.model_dump())}\n\n"
        except Exception:
            pass

        async for event, data in c.events.subscribe():
            if await request.is_disconnected():
                break
            name = _map(event)
            payload = json.dumps(data if data is not None else {})
            yield f"event: {name}\ndata: {payload}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.websocket("/api/ws")
async def ws_events(websocket: WebSocket):
    await websocket.accept()
    c = get_container()
    try:
        stats = await c.queue.get_stats()
        await websocket.send_text(json.dumps({"event": "stats", "data": stats.model_dump()}))
    except Exception:
        pass
    try:
        async for event, data in c.events.subscribe():
            await websocket.send_text(json.dumps({"event": _map(event), "data": data if data is not None else {}}))
    except WebSocketDisconnect:
        return
    except Exception:
        return
