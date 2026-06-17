"""FastAPI application entrypoint.

Python equivalent of `src/backend/server.ts` (the Express app + bootstrap).
Wires CORS, the request logger, the error-normalization handlers, the static
`/output` mount, all routers, and the container lifespan (startup/shutdown).
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_config
from app.core.errors import AppError
from app.presentation.container import get_container
from app.presentation.middleware import (
    RequestLoggerMiddleware,
    app_error_handler,
    not_found_handler,
    unhandled_error_handler,
)
from app.presentation.routers import events, health, images, queue, settings, vto


@asynccontextmanager
async def lifespan(app: FastAPI):
    container = get_container()
    await container.startup()

    # Serve generated output images statically at /output (server.ts static mount).
    # Prefer the configured output folder if it exists, else the env OUTPUT_DIR.
    persisted = await container.settings_repository.get()
    serve_dir = persisted.outputFolder or container.config.OUTPUT_DIR
    os.makedirs(serve_dir, exist_ok=True)
    app.mount("/output", StaticFiles(directory=serve_dir), name="output")

    container.logger.info(f"Server running on port {container.config.PORT}", {
        "env": container.config.NODE_ENV, "port": container.config.PORT,
    })
    try:
        yield
    finally:
        await container.shutdown()


def create_app() -> FastAPI:
    config = get_config()
    app = FastAPI(title="AI Bulk Image Generator (Python)", version="2.0.0", lifespan=lifespan)

    app.add_middleware(RequestLoggerMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Error-normalization layer
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(404, not_found_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    # Routers
    app.include_router(images.router)
    app.include_router(queue.router)
    app.include_router(settings.router)
    app.include_router(vto.router)
    app.include_router(events.router)
    app.include_router(health.router)
    return app


app = create_app()


if __name__ == "__main__":
    cfg = get_config()
    uvicorn.run("app.main:app", host="0.0.0.0", port=cfg.PORT, reload=cfg.NODE_ENV == "development")
