"""AI Full Production Pipeline router.

FEATURE: AI Full Production Photoshoot Pipeline

Endpoint:
  POST /api/pipeline — one product image → multiple professional angles,
                       each returned as a SEPARATE base64 image.

Supported angles:
  Stage 1 (gemini-3.1-flash-image): front, side, back, detail
  Stage 2: ghost_front, ghost_back (MockupService) · model (VTO; needs person)
  Stage 3: outdoor (2-step VTO → gemini-3.1-flash-image; needs person + outdoor)

All requested angles run sequentially (rate-limit safe); one angle failing is
reported per-angle and never blocks the others.

Isolated: reuses the existing container + ProductionPipelineService, which
orchestrates the already-in-production MockupService and VTO service. Touches
no queue state. VTO / Mockup source untouched.
"""
from __future__ import annotations

import base64
import re

from fastapi import APIRouter

from app.core.errors import ValidationError
from app.infrastructure.providers.production_pipeline_service import (
    ALL_ANGLES,
    PipelineRequest,
)
from app.presentation.container import get_container
from app.presentation.schemas import PipelineSchema

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

_DATA_URL_PREFIX = re.compile(r"^data:image/[a-zA-Z]+;base64,")


def _detect_mime(value: str) -> str:
    m = re.match(r"^data:(image/[a-zA-Z]+);base64,", value)
    return m.group(1) if m else "image/jpeg"


def _clean_b64(value: str, field: str) -> tuple[str, str]:
    mime = _detect_mime(value)
    cleaned = _DATA_URL_PREFIX.sub("", value).strip()
    try:
        base64.b64decode(cleaned, validate=True)
    except Exception:
        raise ValidationError(f"{field} is not valid base64-encoded image data")
    return cleaned, mime


@router.post("")
async def generate_pipeline(body: PipelineSchema):
    c = get_container()

    front_b64, front_mime = _clean_b64(body.imageFront, "imageFront")
    back_b64 = None
    if body.imageBack:
        back_b64, _ = _clean_b64(body.imageBack, "imageBack")
    person_b64 = None
    if body.personImage:
        person_b64, _ = _clean_b64(body.personImage, "personImage")
    outdoor_b64 = None
    if body.outdoorImage:
        outdoor_b64, _ = _clean_b64(body.outdoorImage, "outdoorImage")

    requested = tuple(body.angles) if body.angles else ALL_ANGLES
    invalid = [a for a in requested if a not in ALL_ANGLES]
    if invalid:
        raise ValidationError(
            f"Unknown angle(s): {', '.join(invalid)}. Supported: {', '.join(ALL_ANGLES)}."
        )

    # fail fast with clear messages when a VTO-based angle lacks its person image
    if "model" in requested and not person_b64:
        raise ValidationError("The 'model' angle requires a personImage.")
    if "outdoor" in requested and not person_b64:
        raise ValidationError("The 'outdoor' angle requires a personImage (the outdoor background is optional).")

    service = c.pipeline_service
    results = await service.generate_angles(PipelineRequest(
        image_front_b64=front_b64,
        image_back_b64=back_b64,
        person_b64=person_b64,
        outdoor_b64=outdoor_b64,
        angles=requested,
        mime_type=front_mime,
    ))

    images = []
    for r in results:
        item = {"angle": r.angle, "success": r.success}
        if r.success and r.image_b64:
            item["image"] = r.image_b64
            item["mimeType"] = r.mime_type
            item["dataUrl"] = f"data:{r.mime_type};base64,{r.image_b64}"
        else:
            item["error"] = r.error
        images.append(item)

    succeeded = sum(1 for i in images if i["success"])
    return {
        "success": True,
        "data": {
            "images": images,
            "totalRequested": len(results),
            "totalSucceeded": succeeded,
            "totalFailed": len(results) - succeeded,
        },
    }
