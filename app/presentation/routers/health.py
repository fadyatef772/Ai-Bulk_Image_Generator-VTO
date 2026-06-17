"""Health router — GET /api/health."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health():
    return {"success": True, "status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
