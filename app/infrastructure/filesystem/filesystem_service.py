"""Filesystem service.

Python equivalent of `src/backend/infrastructure/filesystem/FileSystemService.ts`.
Preserves the output directory layout (Generated / Failed / Logs / Temp) and the
`<sanitizedName>_<timestamp>_<uuid8><ext>` filename scheme, so generated files
land exactly where the original system put them.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiofiles

from app.core.errors import FileSystemError
from app.core.logging import Logger
from app.domain.interfaces import IFileSystemService

_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


class FileSystemService(IFileSystemService):
    def __init__(self, logger: Logger) -> None:
        self._logger = logger

    async def ensure_directory_structure(self, base_dir: str) -> None:
        dirs = [
            base_dir,
            os.path.join(base_dir, "Generated"),
            os.path.join(base_dir, "Failed"),
            os.path.join(base_dir, "Logs"),
            os.path.join(base_dir, "Temp"),
        ]
        for d in dirs:
            try:
                os.makedirs(d, exist_ok=True)
            except OSError as e:
                raise FileSystemError(f"Failed to create directory {d}: {e}")
        self._logger.info("Directory structure ensured", {"baseDir": base_dir})

    async def save_generated_image(
        self, image_buffer: bytes, original_name: str, mime_type: str,
        output_dir: str, subfolder: str = "Generated",
    ) -> str:
        try:
            await self.ensure_directory_structure(output_dir)
            ext = _MIME_TO_EXT.get(mime_type.lower(), ".png")
            base = os.path.splitext(os.path.basename(original_name))[0]
            sanitized = self._sanitize_filename(base)
            timestamp = datetime.now(timezone.utc).isoformat().replace(":", "-").replace(".", "-")[:19]
            unique = uuid.uuid4().hex[:8]
            filename = f"{sanitized}_{timestamp}_{unique}{ext}"
            output_path = os.path.join(output_dir, subfolder, filename)
            async with aiofiles.open(output_path, "wb") as f:
                await f.write(image_buffer)
            self._logger.info("Generated image saved", {"filename": filename, "outputPath": output_path, "sizeBytes": len(image_buffer)})
            return output_path
        except FileSystemError:
            raise
        except Exception as e:  # noqa: BLE001
            raise FileSystemError(f"Failed to save image: {e}")

    async def save_failed_record(self, job_id: str, error_message: str, output_dir: str) -> None:
        try:
            failed_dir = os.path.join(output_dir, "Failed")
            os.makedirs(failed_dir, exist_ok=True)
            timestamp = datetime.now(timezone.utc).isoformat()
            record = {"jobId": job_id, "errorMessage": error_message, "timestamp": timestamp}
            safe_ts = timestamp.replace(":", "-").replace(".", "-")
            path = os.path.join(failed_dir, f"failed_{job_id}_{safe_ts}.json")
            async with aiofiles.open(path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(record, indent=2))
        except Exception as e:  # noqa: BLE001
            self._logger.error("Failed to save error record", e)

    async def read_image_as_buffer(self, file_path: str) -> bytes:
        if not os.path.exists(file_path):
            raise FileSystemError(f"File not found: {file_path}")
        try:
            async with aiofiles.open(file_path, "rb") as f:
                return await f.read()
        except Exception as e:  # noqa: BLE001
            raise FileSystemError(f"Failed to read file: {e}")

    async def delete_file(self, file_path: str) -> None:
        try:
            os.unlink(file_path)
            self._logger.debug("File deleted", {"filePath": file_path})
        except Exception as e:  # noqa: BLE001
            raise FileSystemError(f"Failed to delete file: {e}")

    async def file_exists(self, file_path: str) -> bool:
        return os.path.exists(file_path)

    async def get_file_size(self, file_path: str) -> int:
        try:
            return os.path.getsize(file_path)
        except Exception as e:  # noqa: BLE001
            raise FileSystemError(f"Failed to get file size: {e}")

    async def list_files(self, directory: str, extensions: Optional[list[str]] = None) -> list[str]:
        try:
            out: list[str] = []
            for name in os.listdir(directory):
                full = os.path.join(directory, name)
                if os.path.isfile(full):
                    if not extensions or any(name.lower().endswith(ext) for ext in extensions):
                        out.append(full)
            return out
        except Exception as e:  # noqa: BLE001
            raise FileSystemError(f"Failed to list files: {e}")

    async def open_in_explorer(self, target_path: str) -> None:
        try:
            if sys.platform == "win32":
                cmd = ["explorer", target_path]
            elif sys.platform == "darwin":
                cmd = ["open", target_path]
            else:
                cmd = ["xdg-open", target_path]
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
            )
            await proc.wait()
        except Exception as e:  # noqa: BLE001
            self._logger.error("Failed to open in explorer", e)

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        name = re.sub(r"[^a-zA-Z0-9\-_]", "_", name)
        name = re.sub(r"_+", "_", name)
        return name[:50]
