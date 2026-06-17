"""Dust.tt image-generation provider.

Python equivalent of `src/backend/infrastructure/dust/DustService.ts`.
Creates a Dust conversation with the image attached, polls for the agent's
reply, and extracts the generated image (data-URL or file attachment). Uses
async `httpx`.
"""
from __future__ import annotations

import asyncio
import base64
import os
import re
import time
from typing import Optional

import httpx

from app.core.errors import GeminiError
from app.core.logging import Logger
from app.domain.interfaces import (
    IImageGenerationService,
    ImageGenerationRequest,
    ImageGenerationResponse,
)

_API_BASE = "https://dust.tt/api/v1"
_DATA_URL_RE = re.compile(r"data:(image/[a-z]+);base64,([A-Za-z0-9+/=]+)")


class DustService(IImageGenerationService):
    def __init__(self, logger: Logger) -> None:
        self._logger = logger

    @property
    def _api_key(self) -> str:
        return os.environ.get("DUST_API_KEY", "")

    @property
    def _workspace_id(self) -> str:
        return os.environ.get("DUST_WORKSPACE_ID", "")

    @property
    def _agent_id(self) -> str:
        return os.environ.get("DUST_AGENT_ID", "")

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    async def generate_image(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        if not (self._api_key and self._workspace_id and self._agent_id):
            raise GeminiError(
                "Dust.tt credentials not fully configured. "
                "Please set API Key, Workspace ID, and Agent ID in Settings."
            )
        self._logger.info("Starting Dust.tt image generation", {
            "agentId": self._agent_id, "workspaceId": self._workspace_id, "mimeType": request.mime_type,
        })

        b64 = base64.b64encode(request.image_buffer).decode("ascii")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                convo = await client.post(
                    f"{_API_BASE}/w/{self._workspace_id}/assistant/conversations",
                    headers=self._headers,
                    json={
                        "title": None,
                        "visibility": "unlisted",
                        "message": {
                            "content": request.prompt,
                            "mentions": [{"configurationId": self._agent_id}],
                            "context": {
                                "timezone": "UTC",
                                "username": "bulk-image-generator",
                                "fullName": "AI Bulk Image Generator",
                                "email": None,
                                "profilePictureUrl": None,
                            },
                            "attachments": [{
                                "title": "input_image",
                                "content": f"data:{request.mime_type};base64,{b64}",
                                "contentType": request.mime_type,
                            }],
                        },
                    },
                )
                if convo.status_code != 200:
                    body = convo.text
                    self._logger.error("Dust.tt conversation creation failed", None, {"status": convo.status_code, "body": body})
                    if convo.status_code == 401:
                        raise GeminiError("Dust.tt API key is invalid or expired.")
                    if convo.status_code == 404:
                        raise GeminiError("Dust.tt workspace or agent not found. Check Workspace ID and Agent ID.")
                    raise GeminiError(f"Dust.tt error {convo.status_code}: {body[:300]}")

                data = convo.json()
                conversation_id = (data.get("conversation") or {}).get("sId")
                if not conversation_id:
                    msg = (data.get("error") or {}).get("message", "")
                    raise GeminiError(f"Dust.tt did not return a conversation ID. {msg}")

                self._logger.debug("Dust.tt conversation created", {"conversationId": conversation_id})
                agent_message = await self._poll_for_agent_message(client, conversation_id)

            image = self._extract_image_from_message(agent_message)
            if not image:
                raise GeminiError("Dust.tt agent did not return an image. Ensure the agent is configured to output images.")

            buffer, mime = image
            self._logger.info("Dust.tt image generation successful", {"outputSize": len(buffer), "outputMimeType": mime})
            return ImageGenerationResponse(image_buffer=buffer, mime_type=mime)
        except GeminiError:
            raise
        except Exception as error:  # noqa: BLE001
            self._logger.error("Dust.tt error", error)
            raise GeminiError(f"Dust.tt error: {error}")

    async def _poll_for_agent_message(
        self, client: httpx.AsyncClient, conversation_id: str,
        max_wait_ms: int = 180_000, interval_ms: int = 2_000,
    ) -> dict:
        deadline = time.monotonic() + max_wait_ms / 1000
        while time.monotonic() < deadline:
            await asyncio.sleep(interval_ms / 1000)
            resp = await client.get(
                f"{_API_BASE}/w/{self._workspace_id}/assistant/conversations/{conversation_id}",
                headers=self._headers, timeout=10.0,
            )
            if resp.status_code != 200:
                raise GeminiError(f"Dust.tt polling error {resp.status_code}")

            conversation = (resp.json() or {}).get("conversation")
            if not conversation:
                continue

            agent_messages = [
                m for group in conversation.get("content", [])
                for m in group if isinstance(m, dict) and m.get("type") == "agent_message"
            ]
            if not agent_messages:
                continue

            latest = agent_messages[-1]
            status = latest.get("status")
            if status == "succeeded":
                return latest
            if status in ("failed", "cancelled"):
                err = (latest.get("error") or {}).get("message", "Unknown error")
                raise GeminiError(f"Dust.tt agent {status}: {err}")
            self._logger.debug("Dust.tt agent still running…", {"status": status})

        raise GeminiError("Dust.tt agent timed out after 3 minutes.")

    @staticmethod
    def _extract_image_from_message(message: dict) -> Optional[tuple[bytes, str]]:
        content = message.get("content") or ""
        match = _DATA_URL_RE.search(content)
        if match:
            return base64.b64decode(match.group(2)), match.group(1)

        for f in message.get("files") or []:
            ctype = f.get("contentType", "")
            if ctype.startswith("image/") and f.get("content"):
                return base64.b64decode(f["content"]), ctype or "image/png"
        return None

    async def validate_credentials(self) -> bool:
        if not (self._api_key and self._workspace_id):
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{_API_BASE}/w/{self._workspace_id}/assistant/agent_configurations",
                    headers=self._headers,
                )
                return resp.status_code == 200
        except Exception:
            return False
