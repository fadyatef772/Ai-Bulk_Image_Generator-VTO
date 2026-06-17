"""Vertex AI Imagen-3 image-generation provider.

Python equivalent of `src/backend/infrastructure/vertex/VertexGeminiService.ts`.

The original TypeScript service hand-rolled ADC token resolution and called the
Vertex REST `:predict` endpoint via `fetch`. Per the migration spec
("Remove Vertex REST calls", "use Python Vertex AI SDK"), this version uses the
official `vertexai` SDK (`ImageGenerationModel`), which handles ADC
authentication internally. Blocking SDK calls run in a worker thread.

Auth: Application Default Credentials, identical to the original design. Run:
    gcloud auth application-default login
"""
from __future__ import annotations

import asyncio
import os

from app.core.errors import GeminiError
from app.core.logging import Logger
from app.domain.interfaces import (
    IImageGenerationService,
    ImageGenerationRequest,
    ImageGenerationResponse,
)

_MODEL = "imagen-3.0-generate-002"


class VertexImagenService(IImageGenerationService):
    def __init__(self, logger: Logger) -> None:
        self._logger = logger

    @property
    def _project_id(self) -> str:
        return os.environ.get("VERTEX_PROJECT_ID", "")

    @property
    def _location(self) -> str:
        return os.environ.get("VERTEX_LOCATION", "us-central1")

    async def generate_image(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        if not self._project_id:
            raise GeminiError("Vertex AI Project ID not configured. Set VERTEX_PROJECT_ID in your .env file.")

        self._logger.info("Starting Vertex AI (Imagen 3 Edit) image generation", {
            "model": _MODEL, "projectId": self._project_id, "location": self._location,
        })
        try:
            return await asyncio.to_thread(self._generate_sync, request)
        except GeminiError:
            raise
        except Exception as error:  # noqa: BLE001
            self._logger.error("Vertex AI error", error)
            raise GeminiError(f"Vertex AI error: {error}")

    def _generate_sync(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        try:
            import vertexai
            from vertexai.preview.vision_models import Image, ImageGenerationModel
        except ImportError:
            raise GeminiError(
                "google-cloud-aiplatform (vertexai) is not installed. "
                "Run: pip install google-cloud-aiplatform"
            )

        vertexai.init(project=self._project_id, location=self._location)
        model = ImageGenerationModel.from_pretrained(_MODEL)
        base_image = Image(image_bytes=request.image_buffer)

        # Background inpainting edit — replaces the background, keeps the product.
        # Mirrors the original payload (mode=imageInpainting, maskMode=BACKGROUND).
        try:
            result = model.edit_image(
                base_image=base_image,
                prompt=request.prompt,
                edit_mode="inpainting-insert",
                mask_mode="background",
                number_of_images=1,
            )
        except TypeError:
            # SDK signature drift fallback
            result = model.edit_image(base_image=base_image, prompt=request.prompt, number_of_images=1)

        images = getattr(result, "images", None) or list(result)
        if not images:
            raise GeminiError("Imagen did not return any image data.")

        out = images[0]
        image_bytes = getattr(out, "_image_bytes", None) or getattr(out, "image_bytes", None)
        if image_bytes is None:
            raise GeminiError("Imagen response did not contain image bytes.")

        mime = getattr(out, "_mime_type", None) or "image/png"
        self._logger.info("Vertex AI (Imagen 3 Edit) generation successful", {
            "outputSize": len(image_bytes), "outputMimeType": mime,
        })
        return ImageGenerationResponse(image_buffer=image_bytes, mime_type=mime, tokens_used=0)

    async def validate_credentials(self) -> bool:
        if not self._project_id:
            return False

        def _check() -> bool:
            try:
                import google.auth
                from google.auth.transport.requests import Request
                creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
                creds.refresh(Request())
                return bool(getattr(creds, "token", None))
            except Exception:
                return False
        return await asyncio.to_thread(_check)
