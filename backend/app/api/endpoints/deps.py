from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_admin
from app.models import Floor
from app.schemas import User

__all__ = [
    "check_floor_access",
    "get_allowed_floor_ids_for_user",
    "get_current_user",
    "require_admin",
]


def check_floor_access(user: User, floor_slug_or_id: str, db: Session) -> Floor:
    floor = db.query(Floor).filter(
        (Floor.id == floor_slug_or_id) | (Floor.slug == floor_slug_or_id)
    ).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    if user.role != "admin" and user.allowedFloors:
        if floor.slug not in user.allowedFloors:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to this floor forbidden",
            )
    return floor

def get_allowed_floor_ids_for_user(user: User, db: Session) -> Optional[List[str]]:
    """If user is non-admin with allowedFloors restriction, return the list of allowed floor IDs."""
    if user.role == "admin" or not user.allowedFloors:
        return None
    floors = db.query(Floor).filter(Floor.slug.in_(user.allowedFloors)).all()
    return [f.id for f in floors]

