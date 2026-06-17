"""Images router.

Preserves the exact contract from `presentation/routes/index.ts`:
  POST   /api/images/upload
  GET    /api/images
  DELETE /api/images/{id}
  POST   /api/images/{id}/retry
  POST   /api/images/{id}/cancel
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, Query, UploadFile

from app.application.dto import GalleryQueryDTO
from app.application.use_cases.image_use_cases import UploadFile as UseCaseFile
from app.presentation.container import get_container

router = APIRouter(prefix="/api/images", tags=["images"])

_ALLOWED = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@router.post("/upload", status_code=201)
async def upload(
    files: list[UploadFile] = File(...),
    prompt: str = Form(...),
    outputDir: Optional[str] = Form(default=None),
):
    c = get_container()
    settings = await c.settings_repository.get()
    output_dir = settings.outputFolder or outputDir or ""

    payload: list[UseCaseFile] = []
    for f in files:
        data = await f.read()
        payload.append(UseCaseFile(
            original_name=f.filename or "upload",
            mime_type=f.content_type or "application/octet-stream",
            buffer=data,
            size=len(data),
        ))

    result = await c.upload_use_case.execute(payload, prompt, output_dir)
    return {"success": True, "data": result.model_dump()}


@router.get("")
async def get_gallery(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sortBy: Optional[str] = Query(default=None),
    sortOrder: Optional[str] = Query(default=None),
    limit: Optional[int] = Query(default=None),
    offset: Optional[int] = Query(default=None),
):
    c = get_container()
    result = await c.get_gallery_use_case.execute(GalleryQueryDTO(
        status=status, search=search, sortBy=sortBy, sortOrder=sortOrder, limit=limit, offset=offset,
    ))
    return {
        "success": True,
        "data": {"jobs": [j.model_dump() for j in result["jobs"]], "total": result["total"]},
    }


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    c = get_container()
    await c.delete_job_use_case.execute(job_id)
    return {"success": True, "message": "Job deleted"}


@router.post("/{job_id}/retry")
async def retry_job(job_id: str):
    c = get_container()
    job = await c.retry_job_use_case.execute(job_id)
    return {"success": True, "data": job.model_dump()}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    c = get_container()
    await c.queue.cancel_job(job_id)
    return {"success": True, "message": "Job cancelled"}
