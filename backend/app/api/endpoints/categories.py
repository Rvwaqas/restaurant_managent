from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.endpoints.deps import (
    check_floor_access,
    get_allowed_floor_ids_for_user,
    get_current_user,
    require_admin,
)
from app.core.database import get_db
from app.schemas import (
    CategorySchema,
    CreateCategoryPayload,
    DeleteResult,
    ReorderCategoriesPayload,
    UpdateCategoryPayload,
    User,
)
from app.services.categories import (
    create_category,
    get_category_by_id,
    list_categories,
    remove_category,
    reorder_categories,
    update_category,
)

router = APIRouter(prefix="/categories", tags=["categories"])

@router.get("", response_model=List[CategorySchema], response_model_exclude_none=True)
def get_categories(
    floorId: Optional[str] = Query(None),
    includeInactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if floorId:
        check_floor_access(current_user, floorId, db)
        return list_categories(
            db=db,
            floor_id=floorId,
            include_inactive=includeInactive,
            is_admin=(current_user.role == "admin"),
        )

    allowed_ids = get_allowed_floor_ids_for_user(current_user, db)
    all_cats = list_categories(
        db=db,
        floor_id=None,
        include_inactive=includeInactive,
        is_admin=(current_user.role == "admin"),
    )
    if allowed_ids is not None:
        all_cats = [c for c in all_cats if c.floorId in allowed_ids]
    return all_cats

@router.post("/reorder", response_model=List[CategorySchema], response_model_exclude_none=True)
def reorder(
    payload: ReorderCategoriesPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return reorder_categories(
        db=db,
        floor_id=payload.floorId,
        ordered_ids=payload.orderedIds,
        user_id=current_user.id,
    )

@router.get("/{category_id}", response_model=CategorySchema, response_model_exclude_none=True)
def get_single_category(
    category_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = get_category_by_id(db, category_id)
    check_floor_access(current_user, cat.floorId, db)
    return cat

@router.post("", response_model=CategorySchema, status_code=status.HTTP_201_CREATED, response_model_exclude_none=True)
def create_single_category(
    payload: CreateCategoryPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return create_category(db, payload, user_id=current_user.id)

@router.put("/{category_id}", response_model=CategorySchema, response_model_exclude_none=True)
def update_single_category(
    category_id: str,
    payload: UpdateCategoryPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return update_category(db, category_id, payload, user_id=current_user.id)

@router.delete("/{category_id}", response_model=DeleteResult)
def delete_single_category(
    category_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return remove_category(db, category_id, user_id=current_user.id)

