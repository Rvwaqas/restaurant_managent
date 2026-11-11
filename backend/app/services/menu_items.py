import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.money import round_money
from app.models import Category, Floor, MenuItem, OrderItem
from app.schemas import (
    CreateMenuItemPayload,
    DuplicateMenuItemPayload,
    MenuItemSchema,
    UpdateMenuItemPayload,
)
from app.services import audit
from app.services.events import emit
from app.services.uploads import cleanup_orphaned_image, expand_image_url, normalize_image_url

audit_logger = logging.getLogger("audit")

def get_menu_item_schema(item: MenuItem, request: Optional[Request] = None) -> MenuItemSchema:
    return MenuItemSchema(
        id=item.id,
        floorId=item.floor_id,
        categoryId=item.category_id,
        name=item.name,
        price=round_money(item.price),
        available=item.available,
        isActive=item.is_active,
        sortOrder=item.sort_order,
        image=expand_image_url(item.image, request),
        description=item.description,
        subcategory=item.subcategory,
    )

def list_menu_items(
    db: Session,
    floor_id: Optional[str] = None,
    category_id: Optional[str] = None,
    include_inactive: bool = False,
    is_admin: bool = False,
    request: Optional[Request] = None,
) -> List[MenuItemSchema]:
    query = db.query(MenuItem).filter(MenuItem.is_deleted == False)

    if floor_id:
        query = query.filter(MenuItem.floor_id == floor_id)
    if category_id:
        query = query.filter(MenuItem.category_id == category_id)

    if not is_admin or not include_inactive:
        query = query.filter(MenuItem.is_active == True)

    items = query.order_by(MenuItem.sort_order).all()
    return [get_menu_item_schema(i, request) for i in items]

def get_menu_item_by_id(db: Session, item_id: str, request: Optional[Request] = None) -> MenuItemSchema:
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.is_deleted == False).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return get_menu_item_schema(item, request)

def create_menu_item(
    db: Session,
    payload: CreateMenuItemPayload,
    user_id: str,
    request: Optional[Request] = None,
) -> MenuItemSchema:
    name_trimmed = payload.name.strip()
    if not name_trimmed or len(name_trimmed) > 150:
        raise HTTPException(status_code=422, detail="Item name must be between 1 and 150 characters.")

    if payload.price <= 0 or payload.price > 9999999.99:
        raise HTTPException(status_code=422, detail="Price must be greater than 0 and less than 10,000,000.")

    if payload.description and len(payload.description) > 500:
        raise HTTPException(status_code=422, detail="Description must be 500 characters or less.")

    # Validate floor exists
    floor = db.query(Floor).filter(Floor.id == payload.floorId).first()
    if not floor:
        raise HTTPException(status_code=422, detail="Floor not found")

    # Validate category exists, is non-deleted, and belongs to the same floor
    cat = db.query(Category).filter(
        Category.id == payload.categoryId,
        Category.is_deleted == False,
    ).first()
    if not cat or cat.floor_id != payload.floorId:
        raise HTTPException(
            status_code=422,
            detail="categoryId does not exist or does not belong to the item's floor.",
        )

    cat_items_count = db.query(MenuItem).filter(
        MenuItem.category_id == payload.categoryId,
        MenuItem.is_deleted == False,
    ).count()

    item_id = f"mi-{uuid.uuid4().hex[:8]}"
    normalized_img = normalize_image_url(payload.image)

    new_item = MenuItem(
        id=item_id,
        floor_id=payload.floorId,
        category_id=payload.categoryId,
        name=name_trimmed,
        price=round_money(payload.price),
        image=normalized_img,
        description=payload.description,
        available=payload.available if payload.available is not None else True,
        is_active=payload.isActive if payload.isActive is not None else True,
        is_deleted=False,
        sort_order=payload.sortOrder if payload.sortOrder is not None else cat_items_count + 1,
        subcategory=payload.subcategory,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    audit_logger.info(f"AUDIT user={user_id} action=create entity=menu_item ids={new_item.id} result=success")
    emit("menu.changed", {"floorId": new_item.floor_id})
    return get_menu_item_schema(new_item, request)

def update_menu_item(
    db: Session,
    item_id: str,
    payload: UpdateMenuItemPayload,
    user_id: str,
    request: Optional[Request] = None,
) -> MenuItemSchema:
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.is_deleted == False).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    old_price = item.price
    price_changed = False

    if payload.name is not None:
        name_trimmed = payload.name.strip()
        if not name_trimmed or len(name_trimmed) > 150:
            raise HTTPException(status_code=422, detail="Item name must be between 1 and 150 characters.")
        item.name = name_trimmed

    if payload.price is not None:
        if payload.price <= 0 or payload.price > 9999999.99:
            raise HTTPException(status_code=422, detail="Price must be greater than 0 and less than 10,000,000.")
        new_price = round_money(payload.price)
        if new_price != old_price:
            price_changed = True
        item.price = new_price

    if payload.categoryId is not None and payload.categoryId != item.category_id:
        cat = db.query(Category).filter(
            Category.id == payload.categoryId,
            Category.is_deleted == False,
        ).first()
        if not cat or cat.floor_id != item.floor_id:
            raise HTTPException(
                status_code=422,
                detail="categoryId does not exist or does not belong to the item's floor.",
            )
        item.category_id = payload.categoryId

    if payload.description is not None:
        if payload.description and len(payload.description) > 500:
            raise HTTPException(status_code=422, detail="Description must be 500 characters or less.")
        item.description = payload.description

    old_image = item.image
    if payload.image is not None:
        item.image = normalize_image_url(payload.image)

    if payload.available is not None:
        item.available = payload.available
    if payload.isActive is not None:
        item.is_active = payload.isActive
    if payload.sortOrder is not None:
        item.sort_order = payload.sortOrder
    if payload.subcategory is not None:
        item.subcategory = payload.subcategory

    from app.services import audit
    if price_changed:
        audit.record(
            session=db,
            event="menu.item.price_changed",
            user_id=user_id,
            role="admin",
            entity="menu_item",
            entity_id=item.id,
            details={"itemId": item.id, "name": item.name, "oldPrice": old_price, "newPrice": item.price},
        )

    db.commit()
    db.refresh(item)

    if payload.image is not None and old_image != item.image:
        cleanup_orphaned_image(old_image, db)

    audit_logger.info(f"AUDIT user={user_id} action=update entity=menu_item ids={item.id} result=success")
    emit("menu.changed", {"floorId": item.floor_id})
    return get_menu_item_schema(item, request)

def set_menu_item_availability(
    db: Session,
    item_id: str,
    available: Optional[bool],
    user_id: str,
    request: Optional[Request] = None,
) -> MenuItemSchema:
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.is_deleted == False).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    item.available = not item.available if available is None else available
    db.commit()
    db.refresh(item)

    audit_logger.info(
        f"AUDIT user={user_id} action=set_availability entity=menu_item ids={item.id} result=success"
    )
    emit("menu.changed", {"floorId": item.floor_id})
    return get_menu_item_schema(item, request)

def duplicate_menu_item(
    db: Session,
    item_id: str,
    payload: DuplicateMenuItemPayload,
    user_id: str,
    request: Optional[Request] = None,
) -> MenuItemSchema:
    source = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.is_deleted == False).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source menu item not found")

    target_cat = db.query(Category).filter(
        Category.id == payload.targetCategoryId,
        Category.floor_id == payload.targetFloorId,
        Category.is_deleted == False,
    ).first()
    if not target_cat:
        raise HTTPException(
            status_code=400,
            detail="Target category does not exist on the target floor.",
        )

    cat_items_count = db.query(MenuItem).filter(
        MenuItem.category_id == payload.targetCategoryId,
        MenuItem.is_deleted == False,
    ).count()

    cloned_id = f"mi-{uuid.uuid4().hex[:8]}"
    cloned_item = MenuItem(
        id=cloned_id,
        floor_id=payload.targetFloorId,
        category_id=payload.targetCategoryId,
        name=source.name,
        price=source.price,
        description=source.description,
        image=source.image,
        available=source.available,
        is_active=True,
        is_deleted=False,
        sort_order=cat_items_count + 1,
        subcategory=source.subcategory,
    )
    db.add(cloned_item)
    db.commit()
    db.refresh(cloned_item)

    audit_logger.info(f"AUDIT user={user_id} action=duplicate entity=menu_item ids={cloned_item.id} result=success")
    emit("menu.changed", {"floorId": cloned_item.floor_id})
    return get_menu_item_schema(cloned_item, request)

def reorder_menu_items(
    db: Session,
    category_id: str,
    ordered_ids: List[str],
    user_id: str,
    request: Optional[Request] = None,
) -> List[MenuItemSchema]:
    items = db.query(MenuItem).filter(
        MenuItem.category_id == category_id,
        MenuItem.is_deleted == False,
    ).all()

    existing_ids = {i.id for i in items}
    if set(ordered_ids) != existing_ids or len(ordered_ids) != len(existing_ids):
        raise HTTPException(
            status_code=422,
            detail="orderedIds must contain exactly all non-deleted item IDs in this category without duplicates or omissions.",
        )

    item_map = {i.id: i for i in items}
    floor_id = items[0].floor_id if items else None

    for idx, i_id in enumerate(ordered_ids):
        item_map[i_id].sort_order = idx + 1

    db.commit()
    audit_logger.info(f"AUDIT user={user_id} action=reorder entity=menu_item ids={ordered_ids} result=success")
    if floor_id:
        emit("menu.changed", {"floorId": floor_id})

    updated = db.query(MenuItem).filter(
        MenuItem.category_id == category_id,
        MenuItem.is_deleted == False,
    ).order_by(MenuItem.sort_order).all()
    return [get_menu_item_schema(i, request) for i in updated]

def remove_menu_item(db: Session, item_id: str, user_id: str) -> Dict[str, Any]:
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.is_deleted == False).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    has_order_history = db.query(OrderItem).filter(OrderItem.menu_item_id == item_id).first() is not None
    floor_id = item.floor_id
    item_name = item.name
    old_image = item.image

    if has_order_history:
        item.is_active = False
        item.is_deleted = True
        audit.record(
            session=db,
            event="menu.item.deleted",
            user_id=user_id,
            role="admin",
            entity="menu_item",
            entity_id=item_id,
            details={"itemId": item_id, "name": item_name, "softDeleted": True},
        )
        db.commit()
        result = {
            "success": True,
            "softDeleted": True,
            "message": f'Item "{item_name}" is part of order history; deactivated instead of deleted.',
        }
    else:
        audit.record(
            session=db,
            event="menu.item.deleted",
            user_id=user_id,
            role="admin",
            entity="menu_item",
            entity_id=item_id,
            details={"itemId": item_id, "name": item_name, "softDeleted": False},
        )
        db.delete(item)
        db.commit()
        cleanup_orphaned_image(old_image, db)
        result = {
            "success": True,
            "softDeleted": False,
            "message": f'Item "{item_name}" deleted.',
        }

    audit_logger.info(f"AUDIT user={user_id} action=delete entity=menu_item ids={item_id} result=success")
    emit("menu.changed", {"floorId": floor_id})
    return result

