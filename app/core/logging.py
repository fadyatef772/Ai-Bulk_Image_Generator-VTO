"""Structured logging.

Python equivalent of `src/backend/infrastructure/logger/WinstonLogger.ts`.
Provides JSON-formatted rotating file logs (app / error / processing) plus a
pretty console stream, and structured key/value metadata on every record.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import os
from datetime import datetime
from typing import Any, Optional

_RESET = "\033[0m"
_COLORS = {
    "DEBUG": "\033[36m",
    "INFO": "\033[32m",
    "WARNING": "\033[33m",
    "ERROR": "\033[31m",
    "CRITICAL": "\033[35m",
}


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            "level": record.levelname.lower(),
            "message": record.getMessage(),
        }
        meta = getattr(record, "meta", None)
        if meta:
            payload.update(meta)
        if record.exc_info:
            payload["stack"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class _ConsoleFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        color = _COLORS.get(record.levelname, "")
        meta = getattr(record, "meta", None)
        meta_str = f" {json.dumps(meta, default=str)}" if meta else ""
        return f"{ts} {color}[{record.levelname.lower()}]{_RESET}: {record.getMessage()}{meta_str}"


class Logger:
    """Thin wrapper exposing info/warn/error/debug with a `meta` dict, matching
    the original ILoggerService interface."""

    def __init__(self, log_dir: str = "./logs", level: str = "info") -> None:
        os.makedirs(log_dir, exist_ok=True)
        self._logger = logging.getLogger("ai-bulk")
        self._logger.setLevel(getattr(logging, level.upper(), logging.INFO))
        self._logger.handlers.clear()
        self._logger.propagate = False

        console = logging.StreamHandler()
        console.setFormatter(_ConsoleFormatter())
        self._logger.addHandler(console)

        def _file(name: str, max_bytes: int, backups: int, lvl: int = logging.NOTSET):
            h = logging.handlers.RotatingFileHandler(
                os.path.join(log_dir, name), maxBytes=max_bytes, backupCount=backups, encoding="utf-8"
            )
            h.setFormatter(_JsonFormatter())
            if lvl:
                h.setLevel(lvl)
            return h

        self._logger.addHandler(_file("app.log", 10 * 1024 * 1024, 5))
        self._logger.addHandler(_file("error.log", 10 * 1024 * 1024, 5, logging.ERROR))
        self._logger.addHandler(_file("processing.log", 50 * 1024 * 1024, 10))

    def info(self, message: str, meta: Optional[dict[str, Any]] = None) -> None:
        self._logger.info(message, extra={"meta": meta or {}})

    def warn(self, message: str, meta: Optional[dict[str, Any]] = None) -> None:
        self._logger.warning(message, extra={"meta": meta or {}})

    def debug(self, message: str, meta: Optional[dict[str, Any]] = None) -> None:
        self._logger.debug(message, extra={"meta": meta or {}})

    def error(
        self,
        message: str,
        error: Optional[BaseException] = None,
        meta: Optional[dict[str, Any]] = None,
    ) -> None:
        merged = dict(meta or {})
        if isinstance(error, BaseException):
            merged["error"] = str(error)
            self._logger.error(message, extra={"meta": merged}, exc_info=error)
        else:
            if error is not None:
                merged["error"] = error
            self._logger.error(message, extra={"meta": merged})


_logger: Optional[Logger] = None


def get_logger(log_dir: Optional[str] = None, level: Optional[str] = None) -> Logger:
    global _logger
    if _logger is None:
        _logger = Logger(log_dir or "./logs", level or "info")
    return _logger
