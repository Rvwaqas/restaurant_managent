import os
import re
import uuid
from typing import Optional

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import MenuItem

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
FILENAME_REGEX = re.compile(r"^[a-f0-9]{32}\.(webp|jpg|jpeg|png)$", re.IGNORECASE)

def detect_image_type(data: bytes) -> Optional[str]:
    """Detect image type from magic bytes: returns 'webp', 'png', 'jpeg', or None."""
    if len(data) >= 8 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if len(data) >= 3 and data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    return None

def normalize_image_url(url: Optional[str]) -> Optional[str]:
    """
    If url contains '/api/uploads/<filename>', extract and return '/api/uploads/<filename>'.
    Otherwise returns url as-is (e.g. external unsplash urls).
    """
    if not url:
        return None
    match = re.search(r"/api/uploads/([a-f0-9]{32}\.(?:webp|jpg|jpeg|png))", url, re.IGNORECASE)
    if match:
        return f"/api/uploads/{match.group(1)}"
    return url

def expand_image_url(url: Optional[str], request: Optional[Request] = None) -> Optional[str]:
    """
    If url starts with '/api/uploads/', expands it to an absolute URL using
    PUBLIC_BASE_URL (if configured) or the incoming request's base URL.
    External URLs are left intact.
    """
    if not url:
        return None
    if url.startswith("/api/uploads/"):
        if settings.PUBLIC_BASE_URL:
            base = settings.PUBLIC_BASE_URL.rstrip("/")
            return f"{base}{url}"
        elif request:
            base = str(request.base_url).rstrip("/")
            return f"{base}{url}"
    return url

async def handle_image_upload(file: UploadFile, request: Request) -> str:
    """Validates file magic bytes, saves to UPLOAD_DIR, and returns the expanded absolute URL."""
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=422,
            detail="File size exceeds maximum allowed limit of 5MB",
        )

    img_type = detect_image_type(contents)
    if not img_type:
        raise HTTPException(
            status_code=422,
            detail="Invalid image format. Allowed formats: PNG, JPEG, WebP",
        )

    ext = "jpg" if img_type == "jpeg" else img_type
    filename = f"{uuid.uuid4().hex}.{ext}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(contents)

    relative_path = f"/api/uploads/{filename}"
    return expand_image_url(relative_path, request) or relative_path

def cleanup_orphaned_image(old_image_path: Optional[str], db: Session) -> None:
    """
    If old_image_path is a local upload (/api/uploads/...) and no other active or
    non-deleted MenuItem references it, delete the file from disk.
    """
    if not old_image_path or not old_image_path.startswith("/api/uploads/"):
        return

    filename = os.path.basename(old_image_path)
    if not FILENAME_REGEX.match(filename):
        return

    # Check if other non-deleted menu item references this relative path
    still_referenced = db.query(MenuItem).filter(
        MenuItem.image == old_image_path,
        MenuItem.is_deleted == False,
    ).first()

    if not still_referenced:
        target_file = os.path.join(settings.UPLOAD_DIR, filename)
        if os.path.exists(target_file):
            try:
                os.remove(target_file)
            except OSError:
                pass

