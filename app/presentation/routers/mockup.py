"""AI 3D Apparel Ghost-Mannequin Mockup router.

FEATURE: AI Bulk 3D Apparel Mockup Engine (gemini-3-pro-image / Nano Banana Pro)

Endpoints:
  POST /api/mockup        — single apparel image → ghost-mannequin mockup (instant base64 result)
  POST /api/mockup/bulk   — many apparel images → queued ghost-mannequin mockups (uses existing queue)

The bulk endpoint reuses the EXISTING ImageQueueService + worker pool. It simply:
  1. forces the provider to 'mockup' per job (via job prompt = garment template)
  2. creates queue jobs the same way bulk upload does

This keeps full parity with the existing queue features: concurrency, retries,
progress via SSE, gallery, ZIP download — all for free, zero queue changes.
"""
from __future__ import annotations

import base64
import os
import re
import uuid

import aiofiles
from fastapi import APIRouter

from app.application.dto import JobResponseDTO
from app.core.errors import ValidationError
from app.domain.interfaces import ImageGenerationRequest
from app.presentation.container import get_container
from app.presentation.schemas import MockupBulkSchema, MockupSchema

router = APIRouter(prefix="/api/mockup", tags=["mockup"])

_DATA_URL_PREFIX = re.compile(r"^data:image/[a-zA-Z]+;base64,")


def _strip_data_url(value: str) -> str:
    return _DATA_URL_PREFIX.sub("", value).strip()


def _detect_mime(value: str) -> str:
    m = re.match(r"^data:(image/[a-zA-Z]+);base64,", value)
    return m.group(1) if m else "image/jpeg"


def _validate_b64(value: str, field: str) -> tuple[str, str]:
    mime = _detect_mime(value)
    cleaned = _strip_data_url(value)
    try:
        base64.b64decode(cleaned, validate=True)
    except Exception:
        raise ValidationError(f"{field} is not valid base64-encoded image data")
    return cleaned, mime


# ── Single mockup — instant result ────────────────────────────────────────────
@router.post("")
async def generate_mockup(body: MockupSchema):
    c = get_container()
    cleaned_b64, mime = _validate_b64(body.image, "image")
    image_bytes = base64.b64decode(cleaned_b64)

    service = c.service_factory.get_mockup_service()
    result = await service.generate_image(ImageGenerationRequest(
        image_buffer=image_bytes,
        mime_type=mime,
        prompt=body.garmentType,   # template key or custom prompt
        model="gemini-3-pro-image",
        quality=90,
    ))

    out_b64 = base64.b64encode(result.image_buffer).decode("utf-8")
    return {
        "success": True,
        "data": {
            "image": out_b64,
            "mimeType": result.mime_type,
            "dataUrl": f"data:{result.mime_type};base64,{out_b64}",
        },
    }


# ── Bulk mockup — queued processing ───────────────────────────────────────────
@router.post("/bulk")
async def generate_mockup_bulk(body: MockupBulkSchema):
    c = get_container()

    if not body.images:
        raise ValidationError("No images provided")

    settings = await c.settings_repository.get()
    output_dir = settings.outputFolder or c.config.OUTPUT_DIR
    if not output_dir:
        raise ValidationError("Output directory not configured. Set it in Settings.")

    await c.filesystem.ensure_directory_structure(output_dir)
    temp_dir = os.path.join(output_dir, "Temp")
    os.makedirs(temp_dir, exist_ok=True)

    accepted: list[JobResponseDTO] = []
    rejected: list[dict] = []

    for item in body.images:
        name = item.get("name", f"mockup_{uuid.uuid4().hex[:8]}.png")
        data = item.get("data", "")
        try:
            cleaned_b64, mime = _validate_b64(data, name)
            image_bytes = base64.b64decode(cleaned_b64)

            temp_filename = f"{uuid.uuid4()}_{name}"
            temp_path = os.path.join(temp_dir, temp_filename)
            async with aiofiles.open(temp_path, "wb") as f:
                await f.write(image_bytes)

            # provider="mockup" is carried per-job — does NOT affect other batches
            job = c.queue.create_job(
                original_path=temp_path,
                original_name=name,
                mime_type=mime,
                file_size=len(image_bytes),
                prompt=body.garmentType or "",
                provider="mockup",
            )
            await c.queue.add_jobs([job])
            accepted.append(JobResponseDTO.from_entity(job))
        except Exception as error:  # noqa: BLE001
            rejected.append({"filename": name, "reason": f"Failed: {error}"})

    return {
        "success": True,
        "data": {
            "accepted": [a.__dict__ if hasattr(a, "__dict__") else a for a in accepted],
            "rejected": rejected,
            "totalAccepted": len(accepted),
            "totalRejected": len(rejected),
            "provider": "mockup",
            "model": "gemini-3-pro-image",
        },
    }