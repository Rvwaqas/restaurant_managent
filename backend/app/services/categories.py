import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Category, Floor, MenuItem, OrderItem, Printer
from app.schemas import CategorySchema, CreateCategoryPayload, UpdateCategoryPayload
from app.services.events import emit

audit_logger = logging.getLogger("audit")

def get_category_schema(category: Category) -> CategorySchema:
    return CategorySchema(
        id=category.id,
        floorId=category.floor_id,
        name=category.name,
        printerId=category.printer_id,
        sortOrder=category.sort_order,
        isActive=category.is_active,
        serveFrom=category.serve_from,
        serveTo=category.serve_to,
    )

def list_categories(
    db: Session,
    floor_id: Optional[str] = None,
    include_inactive: bool = False,
    is_admin: bool = False,
) -> List[CategorySchema]:
    query = db.query(Category).filter(Category.is_deleted == False)
    if floor_id:
        query = query.filter(Category.floor_id == floor_id)
    if not is_admin or not include_inactive:
        query = query.filter(Category.is_active == True)
    categories = query.order_by(Category.sort_order).all()
    return [get_category_schema(c) for c in categories]

def get_category_by_id(db: Session, category_id: str) -> CategorySchema:
    cat = db.query(Category).filter(Category.id == category_id, Category.is_deleted == False).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return get_category_schema(cat)

def create_category(db: Session, payload: CreateCategoryPayload, user_id: str) -> CategorySchema:
    name_trimmed = payload.name.strip()
    if not name_trimmed or len(name_trimmed) > 100:
        raise HTTPException(status_code=422, detail="Category name must be between 1 and 100 characters.")

    # Check floor exists
    floor = db.query(Floor).filter(Floor.id == payload.floorId).first()
    if not floor:
        raise HTTPException(status_code=422, detail="Floor not found")

    # Check printer exists and is active kitchen printer
    printer = db.query(Printer).filter(
        Printer.id == payload.printerId,
        Printer.is_active == True,
        Printer.role == "kitchen",
    ).first()
    if not printer:
        raise HTTPException(
            status_code=422,
            detail="A printer must be assigned to the category and must be an active kitchen printer.",
        )

    # Check uniqueness on floor
    existing = db.query(Category).filter(
        Category.floor_id == payload.floorId,
        func.lower(Category.name) == name_trimmed.lower(),
        Category.is_deleted == False,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f'Category "{name_trimmed}" already exists on this floor.',
        )

    cat_count = db.query(Category).filter(
        Category.floor_id == payload.floorId,
        Category.is_deleted == False,
    ).count()

    cat_id = f"cat-{uuid.uuid4().hex[:8]}"
    new_cat = Category(
        id=cat_id,
        floor_id=payload.floorId,
        name=name_trimmed,
        printer_id=payload.printerId,
        sort_order=payload.sortOrder if payload.sortOrder is not None else cat_count + 1,
        is_active=payload.isActive if payload.isActive is not None else True,
        is_deleted=False,
        serve_from=payload.serveFrom,
        serve_to=payload.serveTo,
    )
    db.add(new_cat)
    try:
        db.commit()
        db.refresh(new_cat)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f'Category "{name_trimmed}" already exists on this floor.',
        )

    audit_logger.info(f"AUDIT user={user_id} action=create entity=category ids={new_cat.id} result=success")
    emit("menu.changed", {"floorId": new_cat.floor_id})
    return get_category_schema(new_cat)

def update_category(db: Session, category_id: str, payload: UpdateCategoryPayload, user_id: str) -> CategorySchema:
    cat = db.query(Category).filter(Category.id == category_id, Category.is_deleted == False).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.name is not None:
        name_trimmed = payload.name.strip()
        if not name_trimmed or len(name_trimmed) > 100:
            raise HTTPException(status_code=422, detail="Category name must be between 1 and 100 characters.")
        if name_trimmed.lower() != cat.name.lower():
            existing = db.query(Category).filter(
                Category.id != category_id,
                Category.floor_id == cat.floor_id,
                func.lower(Category.name) == name_trimmed.lower(),
                Category.is_deleted == False,
            ).first()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f'Category "{name_trimmed}" already exists on this floor.',
                )
            cat.name = name_trimmed

    if payload.printerId is not None and payload.printerId != cat.printer_id:
        printer = db.query(Printer).filter(
            Printer.id == payload.printerId,
            Printer.is_active == True,
            Printer.role == "kitchen",
        ).first()
        if not printer:
            raise HTTPException(
                status_code=422,
                detail="A printer must be assigned to the category and must be an active kitchen printer.",
            )
        cat.printer_id = payload.printerId

    if payload.sortOrder is not None:
        cat.sort_order = payload.sortOrder
    if payload.isActive is not None:
        cat.is_active = payload.isActive
    if payload.serveFrom is not None:
        cat.serve_from = payload.serveFrom
    if payload.serveTo is not None:
        cat.serve_to = payload.serveTo

    try:
        db.commit()
        db.refresh(cat)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f'Category "{cat.name}" already exists on this floor.',
        )

    audit_logger.info(f"AUDIT user={user_id} action=update entity=category ids={cat.id} result=success")
    emit("menu.changed", {"floorId": cat.floor_id})
    return get_category_schema(cat)

def reorder_categories(db: Session, floor_id: str, ordered_ids: List[str], user_id: str) -> List[CategorySchema]:
    cats = db.query(Category).filter(
        Category.floor_id == floor_id,
        Category.is_deleted == False,
    ).all()

    existing_ids = {c.id for c in cats}
    if set(ordered_ids) != existing_ids or len(ordered_ids) != len(existing_ids):
        raise HTTPException(
            status_code=422,
            detail="orderedIds must contain exactly all non-deleted category IDs on this floor without duplicates or omissions.",
        )

    cat_map = {c.id: c for c in cats}
    for idx, c_id in enumerate(ordered_ids):
        cat_map[c_id].sort_order = idx + 1

    db.commit()
    audit_logger.info(f"AUDIT user={user_id} action=reorder entity=category ids={ordered_ids} result=success")
    emit("menu.changed", {"floorId": floor_id})

    updated = db.query(Category).filter(
        Category.floor_id == floor_id,
        Category.is_deleted == False,
    ).order_by(Category.sort_order).all()
    return [get_category_schema(c) for c in updated]

def remove_category(db: Session, category_id: str, user_id: str) -> Dict[str, Any]:
    cat = db.query(Category).filter(Category.id == category_id, Category.is_deleted == False).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    active_items = db.query(MenuItem).filter(
        MenuItem.category_id == category_id,
        MenuItem.is_deleted == False,
    ).all()
    if len(active_items) > 0:
        raise HTTPException(
            status_code=409,
            detail=f'Cannot delete category "{cat.name}": {len(active_items)} active item(s) belong to it. Please reassign or delete the items first.',
        )

    has_order_history = db.query(OrderItem).filter(OrderItem.category_id == category_id).first() is not None
    floor_id = cat.floor_id
    cat_name = cat.name

    from app.services import audit
    if has_order_history:
        cat.is_active = False
        cat.is_deleted = True
        audit.record(
            session=db,
            event="menu.category.deleted",
            user_id=user_id,
            role="admin",
            entity="category",
            entity_id=category_id,
            details={"categoryId": category_id, "name": cat_name, "softDeleted": True},
        )
        db.commit()
        result = {
            "success": True,
            "softDeleted": True,
            "message": f'Category "{cat_name}" has order history; deactivated instead of deleted.',
        }
    else:
        audit.record(
            session=db,
            event="menu.category.deleted",
            user_id=user_id,
            role="admin",
            entity="category",
            entity_id=category_id,
            details={"categoryId": category_id, "name": cat_name, "softDeleted": False},
        )
        db.delete(cat)
        db.commit()
        result = {
            "success": True,
            "softDeleted": False,
            "message": f'Category "{cat_name}" deleted.',
        }

    audit_logger.info(f"AUDIT user={user_id} action=delete entity=category ids={category_id} result=success")
    emit("menu.changed", {"floorId": floor_id})
    return result

