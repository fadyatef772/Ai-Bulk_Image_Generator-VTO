"""Settings router.

Preserves:
  GET  /api/settings
  PUT  /api/settings
  POST /api/settings/validate-key
  POST /api/settings/select-folder
  POST /api/settings/open-folder

Mirrors `SettingsController` secret-masking: secrets are masked on read and
never overwritten with a masked placeholder on write.
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.domain.entities.settings import Settings
from app.presentation.container import get_container
from app.presentation.schemas import SelectFolderSchema, UpdateSettingsSchema, ValidateKeySchema

router = APIRouter(prefix="/api/settings", tags=["settings"])

MASKED = "••••••••"


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return MASKED
    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def is_masked(value: str) -> bool:
    return "*" in value or value == MASKED


@router.get("")
async def get_settings():
    c = get_container()
    s = await c.settings_repository.get()
    data = s.to_dict()
    data["geminiApiKey"] = mask_secret(s.geminiApiKey)
    data["dustApiKey"] = mask_secret(s.dustApiKey)
    return {"success": True, "data": data}


@router.put("")
async def update_settings(body: UpdateSettingsSchema):
    c = get_container()
    current = await c.settings_repository.get()
    updates = body.model_dump(exclude_none=True)

    gemini = (
        updates["geminiApiKey"]
        if updates.get("geminiApiKey") and not is_masked(updates["geminiApiKey"])
        else current.geminiApiKey
    )
    dust = (
        updates["dustApiKey"]
        if updates.get("dustApiKey") and not is_masked(updates["dustApiKey"])
        else current.dustApiKey
    )

    merged = {**current.to_dict(), **updates, "geminiApiKey": gemini, "dustApiKey": dust}
    updated = Settings.from_dict(merged)
    await c.settings_repository.save(updated)

    # Push runtime knobs into the live queue config without a restart
    c.queue.update_config(
        model=updated.model,
        quality=updated.imageQuality,
        output_dir=updated.outputFolder,
        concurrent_workers=updated.concurrentWorkers,
        retry_count=updated.retryCount,
        timeout_ms=updated.timeoutMs,
    )

    if updated.outputFolder:
        await c.filesystem.ensure_directory_structure(updated.outputFolder)

    return {"success": True, "message": "Settings saved"}


@router.post("/validate-key")
async def validate_key(body: ValidateKeySchema):
    c = get_container()
    provider = body.provider
    if not provider or provider == "gemini":
        if not body.apiKey:
            return JSONResponse(status_code=400, content={"success": False, "error": {"message": "API key required"}})
        is_valid = await c.service_factory.get_gemini_service().validate_api_key(body.apiKey)
        return {"success": True, "data": {"isValid": is_valid}}
    is_valid = await c.service_factory.validate_provider(provider)  # type: ignore[arg-type]
    return {"success": True, "data": {"isValid": is_valid}}


@router.post("/select-folder")
async def select_folder(body: SelectFolderSchema):
    c = get_container()
    folder = body.folder
    if folder is None:
        settings = await c.settings_repository.get()
        folder = settings.outputFolder or ""
    if folder:
        await c.filesystem.ensure_directory_structure(folder)
    return {"success": True, "data": {"folder": folder}}


@router.post("/open-folder")
async def open_folder():
    c = get_container()
    settings = await c.settings_repository.get()
    if settings.outputFolder:
        await c.filesystem.open_in_explorer(settings.outputFolder)
    return {"success": True}
