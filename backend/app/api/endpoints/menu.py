from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.endpoints.deps import check_floor_access, get_current_user
from app.core.database import get_db
from app.core.money import round_money
from app.models import Category, MenuItem
from app.schemas import CategorySchema, FloorMenuResponse, MenuItemSchema, User
from app.services.uploads import expand_image_url

router = APIRouter(prefix="/menu", tags=["menu"])

@router.get("", response_model=FloorMenuResponse, response_model_exclude_none=True)
def get_floor_menu(
    floorId: str = Query(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_floor_access(current_user, floorId, db)

    categories = (
        db.query(Category)
        .filter(
            Category.floor_id == floorId,
            Category.is_active == True,
            Category.is_deleted == False,
        )
        .order_by(Category.sort_order)
        .all()
    )
    active_cat_ids = set(c.id for c in categories)

    items = (
        db.query(MenuItem)
        .filter(
            MenuItem.floor_id == floorId,
            MenuItem.is_active == True,
            MenuItem.is_deleted == False,
            MenuItem.category_id.in_(active_cat_ids),
        )
        .order_by(MenuItem.sort_order)
        .all()
    )

    return FloorMenuResponse(
        categories=[
            CategorySchema(
                id=c.id,
                floorId=c.floor_id,
                name=c.name,
                printerId=c.printer_id,
                sortOrder=c.sort_order,
                isActive=c.is_active,
                serveFrom=c.serve_from,
                serveTo=c.serve_to,
            )
            for c in categories
        ],
        items=[
            MenuItemSchema(
                id=i.id,
                floorId=i.floor_id,
                categoryId=i.category_id,
                name=i.name,
                price=round_money(i.price),
                description=i.description,
                image=expand_image_url(i.image, request),
                available=i.available,
                isActive=i.is_active,
                sortOrder=i.sort_order,
                subcategory=i.subcategory,
            )
            for i in items
        ],
    )
