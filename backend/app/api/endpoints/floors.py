from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.endpoints.deps import check_floor_access, get_current_user
from app.core.database import get_db
from app.schemas import FloorSchema, User
from app.services.floors import get_floor_by_slug, list_floors

router = APIRouter(prefix="/floors", tags=["floors"])

@router.get("", response_model=List[FloorSchema], response_model_exclude_none=True)
def get_floors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    all_floors = list_floors(db)
    if current_user.role != "admin" and current_user.allowedFloors:
        all_floors = [f for f in all_floors if f.slug in current_user.allowedFloors]
    return all_floors

@router.get("/{slug}", response_model=FloorSchema, response_model_exclude_none=True)
def get_floor(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_floor_access(current_user, slug, db)
    return get_floor_by_slug(db, slug)

