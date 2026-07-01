"""AI Full Production Pipeline Service.

FEATURE: AI Full Production Photoshoot Pipeline
GOAL:    From ONE product image, generate a full set of professional
         e-commerce angles — each as a SEPARATE output image.

This is an ORCHESTRATOR. It does not introduce a new model pattern; it reuses
verified, in-production building blocks and picks the right one per angle:

  ┌─ Angle ──────────────┬─ Engine ───────────────────────────┬─ Verified ─┐
  │ Front / Side / Back  │ gemini-3.1-flash-image (this svc) │     ✓     │
  │ Detail               │ gemini-3.1-flash-image (this svc) │     ✓     │
  │ Ghost Front / Back   │ MockupService (gemini-3-pro)      │     ✓     │
  │ Full Shot on Model   │ VirtualTryOnService (vto-001)     │     ✓     │
  │ Outdoor              │ VTO → gemini-3.1-flash (2-step)   │     ✓     │
  └──────────────────────┴───────────────────────────────────┴────────────┘

STAGE 1 (this file): the 4 gemini-3.1-flash-image angles — Front, Side, Back,
Detail. Each is an independent single REST call that takes the ORIGINAL product
image and produces one studio angle. No dependency between angles.

Stages 2 (ghost + model) and 3 (outdoor 2-step) are added later, wired into the
same orchestrator without touching this stage.

Auth: ADC (same as MockupService / VTO). Model served from the `global` endpoint.
Isolated: imports nothing from the queue; touches no global state; does not alter
MockupService, VTO, or any existing provider.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

from app.core.errors import GeminiError
from app.core.logging import Logger

# ── Model / endpoint ──────────────────────────────────────────────────────────
_FLASH_MODEL = "gemini-3.1-flash-image"  # Nano Banana 2 — fast, verified for product angles
_REGION = "global"

# ── Rate-limit handling ───────────────────────────────────────────────────────
# gemini-3.1-flash-image (preview) enforces a low burst/concurrency limit even
# though the per-minute quota is huge. Spacing requests out clears it reliably.
# These can be lowered once a quota/limit increase is approved for the model.
_INTER_REQUEST_DELAY_S = 15.0  # gap between consecutive angle requests
_MAX_RETRIES_429 = 5           # retries when a 429 is hit
_BACKOFF_BASE_S = 20.0         # first backoff wait; doubles each retry

# ── Shared style block (identical across all gemini angles) ───────────────────
_STYLE = (
    "Style requirements: ultra-realistic premium commercial fashion photography, "
    "clean composition, sharp focus, true-to-life colors, soft professional lighting, "
    "luxury e-commerce standard, minimal distractions, high resolution, polished and refined output. "
    "Important: Do not alter the original item in any way. Do not add extra design elements. "
    "Do not distort the fit or proportions. Maintain the exact identity of the product in all shots."
)

# ── Per-angle prompts (Stage 1 — gemini-3.1-flash-image) ─────────────────────
# Each takes the ORIGINAL product image and renders one professional angle.
_ANGLE_PROMPTS: dict[str, str] = {
    "front": (
        "Front view — centered, straight-on, clean light studio background. "
        "The garment fills most of the frame: tightly framed, zoomed in, product is large and prominent "
        "with minimal empty background around it. Full product visible edge to edge. " + _STYLE
    ),
    "side": (
        "Side view — clear side profile, showing the garment silhouette and construction, "
        "clean light studio background. The garment fills most of the frame: tightly framed, zoomed in, "
        "product large and prominent with minimal empty background. " + _STYLE
    ),
    "back": (
        "Back view — straight back angle, fully visible, all design details preserved, "
        "clean light studio background. The garment fills most of the frame: tightly framed, zoomed in, "
        "product large and prominent with minimal empty background. " + _STYLE
    ),
    "detail": (
        "Detail shot — extreme close-up on important design details: fabric texture, stitching, "
        "ribbed neckline/cuffs, and any logo/hardware. Shallow depth of field, soft diffused studio "
        "lighting, clean light grey or white background, photorealistic, ultra-detailed. " + _STYLE
    ),
}

# Angles handled by THIS service in Stage 1 (gemini-3.1-flash-image)
STAGE1_ANGLES = ("front", "side", "back", "detail")

# Stage 2 angles — each reuses an existing, production-verified service:
#   ghost_front / ghost_back  → MockupService   (gemini-3-pro-image)
#   model                     → VirtualTryOnService (virtual-try-on-001)
STAGE2_GHOST_ANGLES = ("ghost_front", "ghost_back")
STAGE2_MODEL_ANGLE = "model"
STAGE2_ANGLES = STAGE2_GHOST_ANGLES + (STAGE2_MODEL_ANGLE,)

# Stage 3 angle — 2-step composite:
#   outdoor → VTO (person+product) THEN gemini-3.1-flash-image (VTO-result + outdoor bg)
STAGE3_OUTDOOR_ANGLE = "outdoor"
STAGE3_ANGLES = (STAGE3_OUTDOOR_ANGLE,)

ALL_ANGLES = STAGE1_ANGLES + STAGE2_ANGLES + STAGE3_ANGLES


@dataclass
class PipelineAngleResult:
    angle: str
    success: bool
    image_b64: Optional[str] = None
    mime_type: str = "image/png"
    error: Optional[str] = None


@dataclass
class PipelineRequest:
    """One product, one or more requested angles.

    image_front_b64 : required — used by front/side/detail + ghost_front + model + outdoor
    image_back_b64  : optional — used by back + ghost_back; falls back to front
    person_b64      : optional — required for 'model' and 'outdoor' angles (VTO step).
                      If a 'model'/'outdoor' angle is requested without it, it's skipped.
    outdoor_b64     : optional — required for the 'outdoor' angle (the background scene).
    angles          : which angle keys to generate (defaults to all Stage-1 angles)
    """
    image_front_b64: str
    image_back_b64: Optional[str] = None
    person_b64: Optional[str] = None
    outdoor_b64: Optional[str] = None
    angles: tuple[str, ...] = STAGE1_ANGLES
    mime_type: str = "image/jpeg"


class ProductionPipelineService:
    """Orchestrates multi-angle product photoshoot generation.

    Stage 1: the four gemini-3.1-flash-image angles (this service makes the calls).
    Stage 2: ghost_front / ghost_back via the existing MockupService, and 'model'
             via the existing VirtualTryOnService. This service only orchestrates;
             it does not re-implement those engines.

    Each angle runs sequentially with isolated error handling — one angle failing
    never blocks the others.
    """

    def __init__(self, logger: Logger, mockup_service=None, vto_service=None) -> None:
        self._logger = logger
        # Existing, production-verified services (injected from the container).
        # Optional so Stage-1-only usage / tests still work without them.
        self._mockup = mockup_service
        self._vto = vto_service

    @property
    def _project_id(self) -> str:
        return os.environ.get("VERTEX_PROJECT_ID", "").strip()

    # ── Public API ────────────────────────────────────────────────────────────

    async def generate_angles(self, request: PipelineRequest) -> list[PipelineAngleResult]:
        """Generate all requested angles sequentially, routing each to its engine.

        Routing:
          front/side/back/detail → gemini-3.1-flash-image (this service)
          ghost_front/ghost_back → MockupService (gemini-3-pro-image)
          model                  → VirtualTryOnService (virtual-try-on-001)

        Returns one result per requested angle (success/failure isolated).
        """
        if not self._project_id:
            raise GeminiError(
                "Vertex AI Project ID not configured. Set VERTEX_PROJECT_ID in your .env file."
            )

        wanted = [a for a in request.angles if a in ALL_ANGLES]
        unknown = [a for a in request.angles if a not in ALL_ANGLES]

        self._logger.info("Pipeline: generating angles", {
            "angles": wanted,
            "unknown": unknown,
            "hasBack": bool(request.image_back_b64),
            "hasPerson": bool(request.person_b64),
        })

        out: list[PipelineAngleResult] = []
        for idx, angle in enumerate(wanted):
            # space out requests to respect burst/rate limits
            if idx > 0:
                await asyncio.sleep(_INTER_REQUEST_DELAY_S)

            if angle in STAGE1_ANGLES:
                res = await self._generate_one_with_retry(angle, request)
            elif angle in STAGE2_GHOST_ANGLES:
                res = await self._generate_ghost(angle, request)
            elif angle == STAGE2_MODEL_ANGLE:
                res = await self._generate_model(request)
            elif angle == STAGE3_OUTDOOR_ANGLE:
                res = await self._generate_outdoor(request)
            else:  # pragma: no cover — guarded by ALL_ANGLES filter
                res = PipelineAngleResult(angle=angle, success=False, error="Unhandled angle.")
            out.append(res)

        for angle in unknown:
            out.append(PipelineAngleResult(
                angle=angle, success=False,
                error=f"Unknown angle. Supported: {', '.join(ALL_ANGLES)}.",
            ))
        return out

    # ── Stage 2: ghost mannequin (reuses MockupService) ──────────────────────

    async def _generate_ghost(self, angle: str, request: PipelineRequest) -> PipelineAngleResult:
        """ghost_front / ghost_back via the existing MockupService (gemini-3-pro-image)."""
        if self._mockup is None:
            return PipelineAngleResult(angle=angle, success=False, error="Mockup service not available.")

        # ghost_back uses the back image if provided, else falls back to front
        if angle == "ghost_back" and request.image_back_b64:
            src_b64 = request.image_back_b64
        else:
            src_b64 = request.image_front_b64

        try:
            image_bytes = base64.b64decode(src_b64)
            # MockupService implements IImageGenerationService.generate_image
            from app.domain.interfaces import ImageGenerationRequest
            result = await self._mockup.generate_image(ImageGenerationRequest(
                image_buffer=image_bytes,
                mime_type=request.mime_type,
                prompt="",              # default ghost-mannequin template
                model="gemini-3-pro-image",
                quality=90,
            ))
            out_b64 = base64.b64encode(result.image_buffer).decode("utf-8")
            self._logger.info(f"Pipeline angle '{angle}' generated (mockup)", {"mime": result.mime_type})
            return PipelineAngleResult(
                angle=angle, success=True, image_b64=out_b64, mime_type=result.mime_type,
            )
        except Exception as e:  # noqa: BLE001
            self._logger.error(f"Pipeline ghost angle '{angle}' failed", e)
            return PipelineAngleResult(angle=angle, success=False, error=str(e))

    # ── Stage 2: full shot on model (reuses VirtualTryOnService) ─────────────

    async def _generate_model(self, request: PipelineRequest) -> PipelineAngleResult:
        """'model' angle via the existing VirtualTryOnService (virtual-try-on-001).

        Requires a person image. If none was provided, the angle is skipped
        (reported as a non-fatal failure), not crashed.
        """
        if self._vto is None:
            return PipelineAngleResult(angle="model", success=False, error="VTO service not available.")
        if not request.person_b64:
            return PipelineAngleResult(
                angle="model", success=False,
                error="No person image provided — 'model' angle skipped.",
            )

        try:
            from app.infrastructure.providers.vertex_vto_service import VTORequest
            result = await self._vto.try_on(VTORequest(
                person_image_b64=request.person_b64,
                product_image_b64=request.image_front_b64,
                sample_count=1,
            ))
            self._logger.info("Pipeline angle 'model' generated (VTO)", {"mime": result.mime_type})
            return PipelineAngleResult(
                angle="model", success=True, image_b64=result.image_b64, mime_type=result.mime_type,
            )
        except Exception as e:  # noqa: BLE001
            self._logger.error("Pipeline 'model' angle failed", e)
            return PipelineAngleResult(angle="model", success=False, error=str(e))

    # ── Stage 3: outdoor (2-step: VTO → gemini-3.1-flash-image composite) ────

    async def _generate_outdoor(self, request: PipelineRequest) -> PipelineAngleResult:
        """'outdoor' angle — a 2-step composite.

        Step 1: VTO (person + product) → the model wearing the product.
        Step 2: gemini-3.1-flash-image places the worn model into an outdoor scene.
                - If an outdoor image was provided → composite into THAT scene
                  (sends VTO result + outdoor background image).
                - If no outdoor image → the model generates a suitable outdoor
                  scene from the prompt (VTO result only).

        Requires a person image (for VTO). The outdoor background image is
        OPTIONAL. If person is missing, the angle is skipped (non-fatal). If
        Step 1 fails, Step 2 is not attempted and the failure is reported.
        """
        if self._vto is None:
            return PipelineAngleResult(angle="outdoor", success=False, error="VTO service not available.")
        if not request.person_b64:
            return PipelineAngleResult(
                angle="outdoor", success=False,
                error="No person image provided — 'outdoor' angle skipped.",
            )

        # ── Step 1: VTO — model wears the product ────────────────────────────
        try:
            from app.infrastructure.providers.vertex_vto_service import VTORequest
            vto_res = await self._vto.try_on(VTORequest(
                person_image_b64=request.person_b64,
                product_image_b64=request.image_front_b64,
                sample_count=1,
            ))
            worn_b64 = vto_res.image_b64
            self._logger.info("Pipeline 'outdoor' step 1 (VTO) done", {"mime": vto_res.mime_type})
        except Exception as e:  # noqa: BLE001
            self._logger.error("Pipeline 'outdoor' step 1 (VTO) failed", e)
            return PipelineAngleResult(
                angle="outdoor", success=False,
                error=f"Outdoor step 1 (VTO) failed: {e}",
            )

        # small gap between the two API calls to respect burst limits
        await asyncio.sleep(_INTER_REQUEST_DELAY_S)

        # ── Step 2: place the worn model outdoors ─────────────────────────────
        if request.outdoor_b64:
            # composite into the SPECIFIC outdoor scene provided (2 images)
            prompt = (
                "Place this person (from the first image) into the outdoor location shown in the "
                "second image. Keep the person and their clothing EXACTLY the same — same garment, "
                "color, print, fit, and proportions. Only change the background to the outdoor scene. "
                "Full-body lifestyle fashion photo, natural elegant pose, premium editorial feel, "
                "realistic lighting that matches the outdoor scene. " + _STYLE
            )
            images = [(worn_b64, "image/png"), (request.outdoor_b64, request.mime_type)]
        else:
            # no scene provided — let the model generate a suitable outdoor setting
            prompt = (
                "Place this person into a beautiful, stylish outdoor location — an elegant street, "
                "park, or premium urban setting with natural daylight. Keep the person and their "
                "clothing EXACTLY the same — same garment, color, print, fit, and proportions. "
                "Only add a realistic outdoor background. Full-body lifestyle fashion photo, natural "
                "elegant pose, premium editorial feel, realistic outdoor lighting. " + _STYLE
            )
            images = [(worn_b64, "image/png")]

        try:
            img_b64, mime = await asyncio.to_thread(self._call_flash_multi, prompt, images)
            mode = "scene-image" if request.outdoor_b64 else "auto-scene"
            self._logger.info("Pipeline 'outdoor' step 2 (composite) done", {"mime": mime, "mode": mode})
            return PipelineAngleResult(angle="outdoor", success=True, image_b64=img_b64, mime_type=mime)
        except GeminiError as e:
            self._logger.error("Pipeline 'outdoor' step 2 (composite) failed", e)
            return PipelineAngleResult(
                angle="outdoor", success=False,
                error=f"Outdoor step 2 (composite) failed: {e}",
            )

    # ── Per-angle generation ──────────────────────────────────────────────────

    async def _generate_one_with_retry(self, angle: str, request: PipelineRequest) -> PipelineAngleResult:
        """Generate one angle, retrying on 429 with exponential backoff."""
        attempt = 0
        while True:
            res = await self._generate_one(angle, request)
            if res.success:
                return res
            # retry only on rate-limit (429); other errors fail immediately
            if res.error and "429" in res.error and attempt < _MAX_RETRIES_429:
                wait = _BACKOFF_BASE_S * (2 ** attempt)
                attempt += 1
                self._logger.warn(f"Pipeline angle '{angle}' hit 429 — retry {attempt}/{_MAX_RETRIES_429} in {wait:.0f}s", {})
                await asyncio.sleep(wait)
                continue
            return res

    async def _generate_one(self, angle: str, request: PipelineRequest) -> PipelineAngleResult:
        prompt = _ANGLE_PROMPTS[angle]
        # back angle uses the back image when provided; otherwise falls back to front
        if angle == "back" and request.image_back_b64:
            src_b64 = request.image_back_b64
        else:
            src_b64 = request.image_front_b64

        try:
            img_b64, mime = await asyncio.to_thread(
                self._call_flash, prompt, src_b64, request.mime_type
            )
            self._logger.info(f"Pipeline angle '{angle}' generated", {"mime": mime})
            return PipelineAngleResult(angle=angle, success=True, image_b64=img_b64, mime_type=mime)
        except GeminiError as e:
            return PipelineAngleResult(angle=angle, success=False, error=str(e))

    # ── Blocking REST call (runs in thread) ───────────────────────────────────

    def _call_flash(self, prompt: str, image_b64: str, src_mime: str) -> tuple[str, str]:
        """Single-image gemini-3.1-flash-image call (front/side/back/detail)."""
        return self._call_flash_multi(prompt, [(image_b64, src_mime or "image/jpeg")])

    def _call_flash_multi(self, prompt: str, images: list[tuple[str, str]]) -> tuple[str, str]:
        """gemini-3.1-flash-image call with one or more input images.

        images: list of (base64_data, mime_type) tuples, sent in order after the
        prompt. Used by the outdoor composite (VTO result + outdoor background).
        """
        try:
            import google.auth
            import google.auth.transport.requests
            creds, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            creds.refresh(google.auth.transport.requests.Request())
            token = creds.token
        except Exception as e:
            raise GeminiError(f"Failed to get ADC token: {e}")

        parts = [{"text": prompt}]
        for data_b64, mime in images:
            parts.append({"inlineData": {"mimeType": mime or "image/jpeg", "data": data_b64}})

        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "temperature": 1.0,
            },
        }

        endpoint = (
            f"https://aiplatform.googleapis.com/v1"
            f"/projects/{self._project_id}"
            f"/locations/{_REGION}"
            f"/publishers/google/models/{_FLASH_MODEL}:generateContent"
        )

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint, data=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8")
            if e.code in (401, 403):
                raise GeminiError(f"Pipeline auth failed ({e.code}). Run: gcloud auth application-default login")
            if e.code == 404:
                raise GeminiError(f"Model {_FLASH_MODEL} not found on project {self._project_id}.")
            raise GeminiError(f"Pipeline angle error {e.code}: {err[:240]}")

        candidates = data.get("candidates", [])
        if not candidates:
            raise GeminiError("Pipeline: no candidates returned.")
        for part in candidates[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return inline["data"], (inline.get("mimeType") or inline.get("mime_type") or "image/png")

        texts = [p.get("text", "") for p in candidates[0].get("content", {}).get("parts", []) if p.get("text")]
        raise GeminiError(f"Pipeline: model returned no image. {' '.join(texts)[:160]}")
