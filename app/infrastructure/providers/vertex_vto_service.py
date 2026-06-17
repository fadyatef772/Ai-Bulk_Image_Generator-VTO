"""Virtual Try-On (VTO) service.

NEW module required by the migration spec ("Virtual Try-On System (CRITICAL)").
The original Node codebase had no dedicated VTO endpoint — its Vertex service
did Imagen-3 background inpainting. This implements the spec's VTO requirement:

    model:   virtual-try-on-001
    input:   person image + clothing/product image (base64)
    output:  generated image (base64)

Implementation note on the SDK:
The spec suggests `from vertexai.preview.vision_models import ImageGenerationModel`.
In practice `virtual-try-on-001` is served through the Vertex AI **prediction**
API, so this uses the Vertex AI SDK's `PredictionServiceClient` (still the SDK,
not a hand-rolled REST/fetch call) with `personImage` / `productImages`
instances. Auth is ADC, consistent with the rest of the system. Blocking SDK
calls run in a worker thread.
"""
from __future__ import annotations

import asyncio
import base64
import os
from dataclasses import dataclass
from typing import Optional

from app.core.errors import GeminiError
from app.core.logging import Logger


@dataclass
class VTORequest:
    person_image_b64: str
    product_image_b64: str
    sample_count: int = 1
    base_steps: Optional[int] = None


@dataclass
class VTOResponse:
    image_b64: str
    mime_type: str = "image/png"


class VirtualTryOnService:
    def __init__(self, logger: Logger) -> None:
        self._logger = logger

    @property
    def _project_id(self) -> str:
        return os.environ.get("VERTEX_PROJECT_ID", "")

    @property
    def _location(self) -> str:
        return os.environ.get("VERTEX_LOCATION", "us-central1")

    @property
    def _model(self) -> str:
        return os.environ.get("VTO_MODEL", "virtual-try-on-001")

    async def try_on(self, request: VTORequest) -> VTOResponse:
        if not self._project_id:
            raise GeminiError("Vertex AI Project ID not configured. Set VERTEX_PROJECT_ID.")
        self._logger.info("Starting Virtual Try-On generation", {
            "model": self._model, "projectId": self._project_id, "location": self._location,
        })
        try:
            return await asyncio.to_thread(self._try_on_sync, request)
        except GeminiError:
            raise
        except Exception as error:  # noqa: BLE001
            self._logger.error("Virtual Try-On error", error)
            raise GeminiError(f"Virtual Try-On error: {error}")

    def _try_on_sync(self, request: VTORequest) -> VTOResponse:
        try:
            from google.cloud import aiplatform
            from google.protobuf import struct_pb2
        except ImportError:
            raise GeminiError(
                "google-cloud-aiplatform is not installed. "
                "Run: pip install google-cloud-aiplatform"
            )

        api_endpoint = f"{self._location}-aiplatform.googleapis.com"
        client = aiplatform.gapic.PredictionServiceClient(
            client_options={"api_endpoint": api_endpoint}
        )
        endpoint = (
            f"projects/{self._project_id}/locations/{self._location}"
            f"/publishers/google/models/{self._model}"
        )

        instance = struct_pb2.Struct()
        instance.update({
            "personImage": {"image": {"bytesBase64Encoded": request.person_image_b64}},
            "productImages": [{"image": {"bytesBase64Encoded": request.product_image_b64}}],
        })

        parameters = struct_pb2.Struct()
        params: dict = {"sampleCount": request.sample_count}
        if request.base_steps is not None:
            params["baseSteps"] = request.base_steps
        parameters.update(params)

        response = client.predict(
            endpoint=endpoint, instances=[instance], parameters=parameters
        )
        if not response.predictions:
            raise GeminiError("Virtual Try-On returned no predictions.")

        prediction = dict(response.predictions[0])
        b64 = prediction.get("bytesBase64Encoded")
        if not b64:
            raise GeminiError("Virtual Try-On prediction did not contain image bytes.")
        mime = prediction.get("mimeType", "image/png")

        # Validate it is decodable base64
        try:
            base64.b64decode(b64)
        except Exception:
            raise GeminiError("Virtual Try-On returned malformed image data.")

        self._logger.info("Virtual Try-On generation successful", {"outputMimeType": mime})
        return VTOResponse(image_b64=b64, mime_type=mime)

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
