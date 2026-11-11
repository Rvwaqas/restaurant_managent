import os

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.api.endpoints.deps import require_admin
from app.core.config import settings
from app.schemas import UploadImageResult, User
from app.services.uploads import FILENAME_REGEX, handle_image_upload

router = APIRouter(prefix="/uploads", tags=["uploads"])

@router.post("/image", response_model=UploadImageResult)
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
):
    url = await handle_image_upload(file, request)
    return UploadImageResult(url=url)

@router.get("/{filename}")
async def get_uploaded_image(filename: str):
    if not FILENAME_REGEX.match(filename):
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = os.path.join(settings.UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")

    ext = filename.rsplit(".", 1)[-1].lower()
    media_type = "image/webp" if ext == "webp" else ("image/png" if ext == "png" else "image/jpeg")

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )

