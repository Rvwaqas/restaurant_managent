from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.endpoints.deps import (
    check_floor_access,
    get_allowed_floor_ids_for_user,
    get_current_user,
    require_admin,
)
from app.core.database import get_db
from app.schemas import (
    AvailabilityPayload,
    CreateMenuItemPayload,
    DeleteResult,
    DuplicateMenuItemPayload,
    MenuItemSchema,
    ReorderMenuItemsPayload,
    UpdateMenuItemPayload,
    User,
)
from app.services.menu_items import (
    create_menu_item,
    duplicate_menu_item,
    get_menu_item_by_id,
    list_menu_items,
    remove_menu_item,
    reorder_menu_items,
    set_menu_item_availability,
    update_menu_item,
)

router = APIRouter(prefix="/menu-items", tags=["menu-items"])

@router.get("", response_model=List[MenuItemSchema], response_model_exclude_none=True)
def get_menu_items(
    request: Request,
    floorId: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    includeInactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if floorId:
        check_floor_access(current_user, floorId, db)
        return list_menu_items(
            db=db,
            floor_id=floorId,
            category_id=categoryId,
            include_inactive=includeInactive,
            is_admin=(current_user.role == "admin"),
            request=request,
        )

    allowed_ids = get_allowed_floor_ids_for_user(current_user, db)
    all_items = list_menu_items(
        db=db,
        floor_id=None,
        category_id=categoryId,
        include_inactive=includeInactive,
        is_admin=(current_user.role == "admin"),
        request=request,
    )
    if allowed_ids is not None:
        all_items = [i for i in all_items if i.floorId in allowed_ids]
    return all_items

@router.post("/reorder", response_model=List[MenuItemSchema], response_model_exclude_none=True)
def reorder(
    request: Request,
    payload: ReorderMenuItemsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return reorder_menu_items(
        db=db,
        category_id=payload.categoryId,
        ordered_ids=payload.orderedIds,
        user_id=current_user.id,
        request=request,
    )

@router.get("/{item_id}", response_model=MenuItemSchema, response_model_exclude_none=True)
def get_single_item(
    item_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = get_menu_item_by_id(db, item_id, request=request)
    check_floor_access(current_user, item.floorId, db)
    return item

@router.post("", response_model=MenuItemSchema, status_code=status.HTTP_201_CREATED, response_model_exclude_none=True)
def create_single_item(
    request: Request,
    payload: CreateMenuItemPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return create_menu_item(db, payload, user_id=current_user.id, request=request)

@router.put("/{item_id}", response_model=MenuItemSchema, response_model_exclude_none=True)
def update_single_item(
    item_id: str,
    request: Request,
    payload: UpdateMenuItemPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return update_menu_item(db, item_id, payload, user_id=current_user.id, request=request)

@router.patch("/{item_id}/availability", response_model=MenuItemSchema, response_model_exclude_none=True)
def toggle_availability(
    item_id: str,
    request: Request,
    payload: AvailabilityPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return set_menu_item_availability(
        db,
        item_id=item_id,
        available=payload.available,
        user_id=current_user.id,
        request=request,
    )

@router.post("/{item_id}/duplicate", response_model=MenuItemSchema, status_code=status.HTTP_201_CREATED, response_model_exclude_none=True)
def duplicate_item(
    item_id: str,
    request: Request,
    payload: DuplicateMenuItemPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return duplicate_menu_item(
        db=db,
        item_id=item_id,
        payload=payload,
        user_id=current_user.id,
        request=request,
    )

@router.delete("/{item_id}", response_model=DeleteResult)
def delete_single_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return remove_menu_item(db, item_id, user_id=current_user.id)

