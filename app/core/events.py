"""Async event bus.

Replaces Node's `EventEmitter` (`extends EventEmitter` on ImageQueueService).

Two responsibilities:
  1. `on(event, handler)` / `emit(event, data)` — direct listener API used
     internally (handlers may be sync or async; async ones are scheduled).
  2. `subscribe()` — returns an async iterator queue that receives every emitted
     `(event, data)` pair. The SSE and WebSocket endpoints use this to fan a
     single queue event out to all connected clients.
"""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Awaitable, Callable, Union

Handler = Callable[[Any], Union[None, Awaitable[None]]]


class EventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = {}
        self._subscribers: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    # ── Listener API (EventEmitter.on / .emit) ─────────────────────────────
    def on(self, event: str, handler: Handler) -> None:
        self._handlers.setdefault(event, []).append(handler)

    def emit(self, event: str, data: Any = None) -> None:
        for handler in self._handlers.get(event, []):
            result = handler(data)
            if asyncio.iscoroutine(result):
                self._schedule(result)
        # Fan out to streaming subscribers (SSE / WebSocket)
        for q in list(self._subscribers):
            try:
                q.put_nowait((event, data))
            except asyncio.QueueFull:
                # Drop oldest to keep the stream live rather than block the worker
                try:
                    q.get_nowait()
                    q.put_nowait((event, data))
                except Exception:
                    pass

    def _schedule(self, coro: Awaitable[None]) -> None:
        try:
            loop = self._loop or asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            # No running loop (e.g. during shutdown) — drop silently
            pass

    # ── Streaming API (SSE / WebSocket) ────────────────────────────────────
    async def subscribe(self, maxsize: int = 1000) -> AsyncIterator[tuple[str, Any]]:
        queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)
