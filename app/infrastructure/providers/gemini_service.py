"""Gemini image-generation provider.

Python equivalent of `src/backend/infrastructure/gemini/GeminiService.ts`.
Uses the official `google-generativeai` SDK. Blocking SDK calls are offloaded
to a thread so the asyncio event loop is never blocked.
"""
from __future__ import annotations

import asyncio
import base64
import os
from typing import Optional

from app.core.errors import GeminiError
from app.core.logging import Logger
from app.domain.interfaces import (
    IImageGenerationService,
    ImageGenerationRequest,
    ImageGenerationResponse,
)


class GeminiService(IImageGenerationService):
    def __init__(self, logger: Logger) -> None:
        self._logger = logger

    async def generate_image(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise GeminiError("Gemini API key not configured. Please set it in Settings.")

        self._logger.info("Starting Gemini image generation", {
            "model": request.model, "mimeType": request.mime_type,
            "bufferSize": len(request.image_buffer), "promptLength": len(request.prompt),
        })

        try:
            return await asyncio.to_thread(self._generate_sync, request, api_key)
        except GeminiError:
            raise
        except Exception as error:  # noqa: BLE001
            msg = str(error)
            self._logger.error("Gemini API error", error)
            if "API_KEY_INVALID" in msg or "400" in msg:
                raise GeminiError("Invalid Gemini API key. Please check your settings.")
            if "RATE_LIMIT" in msg or "429" in msg:
                raise GeminiError("Gemini rate limit exceeded. Please wait and retry.")
            if "SAFETY" in msg or "blocked" in msg:
                raise GeminiError("Image was blocked by Gemini safety filters.")
            if "quota" in msg or "QUOTA" in msg:
                raise GeminiError("Gemini API quota exceeded for today.")
            raise GeminiError(f"Gemini API error: {msg}")

    def _generate_sync(self, request: ImageGenerationRequest, api_key: str) -> ImageGenerationResponse:
        try:
            import google.generativeai as genai
        except ImportError:
            raise GeminiError("google-generativeai is not installed. Run: pip install google-generativeai")

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name=request.model or "gemini-2.0-flash-exp",
            generation_config={"response_modalities": ["Text", "Image"]},
        )

        image_part = {"inline_data": {"mime_type": request.mime_type, "data": request.image_buffer}}
        result = model.generate_content([{"text": request.prompt}, image_part])

        result_buffer: Optional[bytes] = None
        result_mime = "image/png"
        for candidate in getattr(result, "candidates", None) or []:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", None) or []:
                inline = getattr(part, "inline_data", None)
                if inline and getattr(inline, "mime_type", "").startswith("image/"):
                    data = inline.data
                    result_buffer = data if isinstance(data, bytes) else base64.b64decode(data)
                    result_mime = inline.mime_type
                    break
            if result_buffer:
                break

        if not result_buffer:
            text = getattr(result, "text", "") or ""
            self._logger.warn("No image in Gemini response", {"textResponse": text[:200]})
            raise GeminiError(f"Gemini did not return an image. Response: {text[:200] or 'empty'}")

        tokens = None
        usage = getattr(result, "usage_metadata", None)
        if usage:
            tokens = getattr(usage, "total_token_count", None)

        self._logger.info("Gemini image generation successful", {
            "outputSize": len(result_buffer), "outputMimeType": result_mime, "tokensUsed": tokens,
        })
        return ImageGenerationResponse(image_buffer=result_buffer, mime_type=result_mime, tokens_used=tokens)

    async def validate_credentials(self) -> bool:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return False
        return await self.validate_api_key(api_key)

    async def validate_api_key(self, api_key: str) -> bool:
        def _check() -> bool:
            try:
                import google.generativeai as genai
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("gemini-1.5-flash")
                resp = model.generate_content('Say "ok" in one word.')
                return bool(getattr(resp, "text", "") )
            except Exception:
                return False
        return await asyncio.to_thread(_check)
