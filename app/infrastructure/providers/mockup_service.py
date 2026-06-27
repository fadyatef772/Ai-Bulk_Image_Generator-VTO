"""AI 3D Apparel Ghost-Mannequin Mockup Service.

FEATURE: AI Bulk 3D Apparel Mockup Engine
MODEL:   gemini-3-pro-image (Nano Banana Pro) via Vertex AI — region "global"

Transforms a flat-lay apparel photo into a professional ghost-mannequin
(invisible mannequin) 3D e-commerce mockup, while preserving the EXACT garment:

  ✅ Garment color
  ✅ Fabric texture & pattern
  ✅ Stitching, collar, sleeves, seams
  ✅ Wrinkles and folds
  ✅ Printed artwork and logos
  ✅ Design colors and product identity

WHAT CHANGES:
  ✦ Presentation → ghost-mannequin 3D worn form
  ✦ Background → clean professional studio
  ✦ Lighting → soft studio diffused lighting

VERIFIED CONFIG (tested working from code, not just Studio):
  endpoint: https://aiplatform.googleapis.com/v1/projects/{project}
            /locations/global/publishers/google/models/gemini-3-pro-image:generateContent
  auth:     ADC (gcloud application-default) — same as the rest of the system
  method:   REST :generateContent (no SDK dependency, no gRPC sidecar)

This implements IImageGenerationService so it drops straight into the existing
queue/worker pipeline with zero changes to queue logic.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import urllib.error
import urllib.request

from app.core.errors import GeminiError
from app.core.logging import Logger
from app.domain.interfaces import (
    IImageGenerationService,
    ImageGenerationRequest,
    ImageGenerationResponse,
)

# ── Model / endpoint config ───────────────────────────────────────────────────
_MODEL = "gemini-3-pro-image"
_REGION = "global"  # Nano Banana Pro is served from the global endpoint

# ── Ghost-mannequin prompt templates ──────────────────────────────────────────
_BASE_PROMPT = (
    "Transform this flat-lay apparel photo into a professional ghost-mannequin "
    "(invisible mannequin) 3D e-commerce product mockup. "
    "Keep the EXACT same garment: identical color, all printed text and graphics, "
    "fabric texture, sleeve colors and panels, collar, cuffs, stitching, and every "
    "design detail. This must be the SAME garment, not a new one. "
    "Show it worn on an invisible ghost mannequin with natural 3D body volume — "
    "filled-out chest and shoulders, symmetric sleeves hanging naturally, the hollow "
    "neckline showing the inside back collar. "
    "Clean seamless light studio background, soft even lighting, subtle drop shadow "
    "beneath. Front-facing, perfectly symmetric, centered. "
    "Premium Shopify / Zara / Amazon catalog quality. Crisp, clean, professional."
)

_PROMPT_TEMPLATES: dict[str, str] = {
    "": _BASE_PROMPT,
    "tshirt":     _BASE_PROMPT + " Garment type: T-shirt.",
    "hoodie":     _BASE_PROMPT + " Garment type: hoodie. Hood rests naturally, drawstrings symmetric, kangaroo pocket visible.",
    "sweatshirt": _BASE_PROMPT + " Garment type: sweatshirt. Ribbed cuffs and waistband clearly visible.",
    "polo":       _BASE_PROMPT + " Garment type: polo shirt. Collar neatly spread, placket buttons visible.",
    "tank":       _BASE_PROMPT + " Garment type: tank top. Shoulder straps hang naturally.",
}


def _resolve_prompt(user_prompt: str) -> str:
    key = user_prompt.strip().lower()
    if key in _PROMPT_TEMPLATES:
        return _PROMPT_TEMPLATES[key]
    if user_prompt.strip():
        return f"{_BASE_PROMPT} Additional instructions: {user_prompt.strip()}"
    return _BASE_PROMPT


class MockupService(IImageGenerationService):
    """Ghost-mannequin 3D apparel mockup provider (gemini-3-pro-image / Nano Banana Pro)."""

    def __init__(self, logger: Logger) -> None:
        self._logger = logger

    @property
    def _project_id(self) -> str:
        return os.environ.get("VERTEX_PROJECT_ID", "").strip()

    # ── IImageGenerationService ───────────────────────────────────────────────

    async def generate_image(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        if not self._project_id:
            raise GeminiError(
                "Vertex AI Project ID not configured. Set VERTEX_PROJECT_ID in your .env file."
            )

        resolved_prompt = _resolve_prompt(request.prompt)

        self._logger.info("MockupService: starting ghost-mannequin mockup", {
            "model": _MODEL,
            "region": _REGION,
            "projectId": self._project_id,
            "promptTemplate": request.prompt or "(default)",
            "inputSizeBytes": len(request.image_buffer),
        })

        try:
            return await asyncio.to_thread(
                self._generate_sync, request.image_buffer, request.mime_type, resolved_prompt
            )
        except GeminiError:
            raise
        except Exception as error:  # noqa: BLE001
            self._logger.error("MockupService: generation error", error)
            raise GeminiError(f"Mockup generation error: {error}")

    async def validate_credentials(self) -> bool:
        if not self._project_id:
            return False

        def _check() -> bool:
            try:
                import google.auth
                from google.auth.transport.requests import Request
                creds, _ = google.auth.default(
                    scopes=["https://www.googleapis.com/auth/cloud-platform"]
                )
                creds.refresh(Request())
                return bool(getattr(creds, "token", None))
            except Exception:
                return False

        return await asyncio.to_thread(_check)

    # ── Synchronous REST call (runs in thread pool) ───────────────────────────

    def _generate_sync(
        self, image_buffer: bytes, mime_type: str, prompt: str
    ) -> ImageGenerationResponse:
        # ── ADC token ──────────────────────────────────────────────────────
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

        image_b64 = base64.b64encode(image_buffer).decode("utf-8")
        src_mime = mime_type or "image/jpeg"

        payload = {
            "contents": [{
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": src_mime, "data": image_b64}},
                ],
            }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "temperature": 1.0,
                "topP": 0.95,
                "imageConfig": {
                    "aspectRatio": "1:1",
                    "imageSize": "1K",
                },
            },
            "safetySettings": [
                {"category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "OFF"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT",  "threshold": "OFF"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",  "threshold": "OFF"},
                {"category": "HARM_CATEGORY_HARASSMENT",         "threshold": "OFF"},
            ],
        }

        # Global endpoint (no region prefix in host)
        endpoint = (
            f"https://aiplatform.googleapis.com/v1"
            f"/projects/{self._project_id}"
            f"/locations/{_REGION}"
            f"/publishers/google/models/{_MODEL}:generateContent"
        )

        self._logger.info("MockupService: calling Nano Banana Pro", {
            "endpoint": endpoint,
            "promptLength": len(prompt),
        })

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                response_data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            self._logger.error("MockupService: Nano Banana Pro REST error", None, {
                "status": e.code, "body": error_body[:500],
            })
            if e.code in (401, 403):
                raise GeminiError(
                    f"Mockup auth failed ({e.code}). Run: gcloud auth application-default login\n"
                    f"Details: {error_body[:200]}"
                )
            if e.code == 404:
                raise GeminiError(
                    f"Model {_MODEL} not found on project {self._project_id} (region {_REGION}). "
                    f"Ensure Nano Banana Pro is enabled.\nDetails: {error_body[:200]}"
                )
            raise GeminiError(f"Nano Banana Pro error {e.code}: {error_body[:300]}")

        # ── Extract image from response ────────────────────────────────────
        candidates = response_data.get("candidates", [])
        if not candidates:
            raise GeminiError(f"Mockup: no candidates returned. {json.dumps(response_data)[:200]}")

        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                image_bytes = base64.b64decode(inline["data"])
                out_mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
                self._logger.info("MockupService: ghost-mannequin mockup successful", {
                    "outputSizeBytes": len(image_bytes),
                    "outputMimeType": out_mime,
                })
                return ImageGenerationResponse(
                    image_buffer=image_bytes,
                    mime_type=out_mime,
                    tokens_used=0,
                )

        # No image part — surface any text the model returned for debugging
        texts = [p.get("text", "") for p in parts if p.get("text")]
        raise GeminiError(
            f"Mockup: model returned no image. Text response: {' '.join(texts)[:200]}"
        )