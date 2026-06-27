"""Request schemas (Pydantic — the Zod replacement).

Python equivalent of `src/backend/presentation/validators/schemas.ts`.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class UpdateSettingsSchema(BaseModel):
    # Provider selection
    apiProvider: Optional[str] = None
    # Gemini
    geminiApiKey: Optional[str] = None
    # Vertex
    vertexProjectId: Optional[str] = None
    vertexLocation: Optional[str] = None
    # Dust
    dustApiKey: Optional[str] = None
    dustWorkspaceId: Optional[str] = None
    dustAgentId: Optional[str] = None
    # Common
    outputFolder: Optional[str] = None
    concurrentWorkers: Optional[int] = Field(default=None, ge=1, le=20)
    retryCount: Optional[int] = Field(default=None, ge=0, le=10)
    timeoutMs: Optional[int] = Field(default=None, ge=10_000, le=600_000)
    imageQuality: Optional[int] = Field(default=None, ge=10, le=100)
    model: Optional[str] = None


class ValidateKeySchema(BaseModel):
    apiKey: Optional[str] = None
    provider: Optional[str] = None


class SelectFolderSchema(BaseModel):
    folder: Optional[str] = None


class VTOSchema(BaseModel):
    """POST /api/vto — person + product image as base64 (with or without data: prefix)."""
    personImage: str = Field(min_length=1, description="Base64-encoded person image")
    productImage: str = Field(min_length=1, description="Base64-encoded clothing/product image")
    sampleCount: int = Field(default=1, ge=1, le=4)
    baseSteps: Optional[int] = Field(default=None, ge=1, le=100)


class MockupSchema(BaseModel):
    """POST /api/mockup — single apparel image → ghost-mannequin 3D mockup."""
    image: str = Field(min_length=1, description="Base64-encoded apparel image (with or without data: prefix)")
    garmentType: str = Field(default="", description="Template: tshirt/hoodie/sweatshirt/polo/tank, or custom prompt, or empty for auto")


class MockupBulkSchema(BaseModel):
    """POST /api/mockup/bulk — multiple apparel images → ghost-mannequin mockups via queue."""
    images: list[dict] = Field(description="List of {name, data} where data is base64-encoded image")
    garmentType: str = Field(default="", description="Template applied to all images")