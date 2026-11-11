from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Floor
from app.schemas import FloorSchema


def list_floors(db: Session) -> List[FloorSchema]:
    floors = db.query(Floor).filter(Floor.is_active == True).order_by(Floor.sort_order).all()
    return [
        FloorSchema(
            id=f.id,
            slug=f.slug,
            name=f.name,
            menuType=f.menu_type,
            sortOrder=f.sort_order,
            isActive=f.is_active,
        )
        for f in floors
    ]

def get_floor_by_slug(db: Session, slug: str) -> FloorSchema:
    floor = db.query(Floor).filter((Floor.slug == slug) | (Floor.id == slug)).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return FloorSchema(
        id=floor.id,
        slug=floor.slug,
        name=floor.name,
        menuType=floor.menu_type,
        sortOrder=floor.sort_order,
        isActive=floor.is_active,
    )

