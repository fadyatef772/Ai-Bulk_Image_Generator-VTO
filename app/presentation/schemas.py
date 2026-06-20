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
