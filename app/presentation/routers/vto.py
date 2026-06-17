"""Virtual Try-On router.

NEW endpoint required by the migration spec:
  POST /api/vto   — person image + product image (base64) → generated image (base64)
"""
from __future__ import annotations

import base64
import re

from fastapi import APIRouter

from app.core.errors import ValidationError
from app.infrastructure.providers.vertex_vto_service import VTORequest
from app.presentation.container import get_container
from app.presentation.schemas import VTOSchema

router = APIRouter(prefix="/api/vto", tags=["vto"])

_DATA_URL_PREFIX = re.compile(r"^data:image/[a-zA-Z]+;base64,")


def _strip_data_url(value: str) -> str:
    return _DATA_URL_PREFIX.sub("", value).strip()


def _validate_b64(value: str, field: str) -> str:
    cleaned = _strip_data_url(value)
    try:
        base64.b64decode(cleaned, validate=True)
    except Exception:
        raise ValidationError(f"{field} is not valid base64-encoded image data")
    return cleaned


@router.post("")
async def virtual_try_on(body: VTOSchema):
    c = get_container()
    person = _validate_b64(body.personImage, "personImage")
    product = _validate_b64(body.productImage, "productImage")

    result = await c.vto_service.try_on(VTORequest(
        person_image_b64=person,
        product_image_b64=product,
        sample_count=body.sampleCount,
        base_steps=body.baseSteps,
    ))

    return {
        "success": True,
        "data": {
            "image": result.image_b64,
            "mimeType": result.mime_type,
            "dataUrl": f"data:{result.mime_type};base64,{result.image_b64}",
        },
    }
