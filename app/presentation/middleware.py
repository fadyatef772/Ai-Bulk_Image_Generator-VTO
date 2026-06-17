"""Presentation middleware.

Python equivalent of `src/backend/presentation/middleware/index.ts`.
Provides the error-normalization layer: AppError → its status code + stable
machine code; everything else → 500 INTERNAL_ERROR. Plus request logging.
"""
from __future__ import annotations

import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.errors import AppError, ValidationError
from app.core.logging import get_logger


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    logger = get_logger()
    logger.warn("Operational error", {
        "code": exc.code, "message": exc.message, "path": request.url.path, "method": request.method,
    })
    error: dict = {"code": exc.code, "message": exc.message}
    if isinstance(exc, ValidationError) and exc.fields:
        error["fields"] = exc.fields
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": error})


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger = get_logger()
    logger.error("Unexpected error", exc, {"path": request.url.path, "method": request.method})
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}},
    )


async def not_found_handler(request: Request, exc) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={"success": False, "error": {
            "code": "NOT_FOUND",
            "message": f"Route {request.method} {request.url.path} not found",
        }},
    )


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger = get_logger()
        logger.debug(f"{request.method} {request.url.path}", {
            "query": str(request.url.query),
            "contentType": request.headers.get("content-type"),
        })
        start = time.monotonic()
        response = await call_next(request)
        response.headers["X-Response-Time-ms"] = f"{(time.monotonic() - start) * 1000:.1f}"
        return response
