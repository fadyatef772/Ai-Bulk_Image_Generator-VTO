"""Application error hierarchy.

Python equivalent of `src/backend/application/errors/AppErrors.ts`.
Each error carries an HTTP status code and a stable machine code, consumed by
the error-normalization middleware in the presentation layer.
"""
from __future__ import annotations

from typing import Optional


class AppError(Exception):
    code: str = "INTERNAL_ERROR"
    status_code: int = 500
    is_operational: bool = True

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        is_operational: bool = True,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.is_operational = is_operational


class ValidationError(AppError):
    def __init__(self, message: str, fields: Optional[dict[str, list[str]]] = None) -> None:
        super().__init__(message, code="VALIDATION_ERROR", status_code=400)
        self.fields = fields


class GeminiError(AppError):
    """Provider error (Gemini / Vertex / Dust). Kept name-compatible with the
    original codebase, which used `GeminiError` for all generation providers."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="GEMINI_ERROR", status_code=502)


class QueueError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="QUEUE_ERROR", status_code=500)


class FileSystemError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="FILESYSTEM_ERROR", status_code=500)


class NotFoundError(AppError):
    def __init__(self, resource: str, identifier: str) -> None:
        super().__init__(f"{resource} not found: {identifier}", code="NOT_FOUND", status_code=404)


class ConfigurationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="CONFIGURATION_ERROR", status_code=500)


class RateLimitError(AppError):
    def __init__(self, retry_after_ms: Optional[int] = None) -> None:
        suffix = f". Retry after {retry_after_ms}ms" if retry_after_ms else ""
        super().__init__(f"Rate limit exceeded{suffix}", code="RATE_LIMIT", status_code=429)
