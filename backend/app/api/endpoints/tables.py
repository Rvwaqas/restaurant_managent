from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.deps import (
    check_floor_access,
    get_allowed_floor_ids_for_user,
    get_current_user,
    require_admin,
)
from app.core.database import get_db
from app.schemas import (
    BulkCreateTablesPayload,
    BulkCreateTablesResult,
    CreateTablePayload,
    DeleteResult,
    TableSchema,
    UpdateTablePayload,
    User,
)
from app.services.tables import (
    bulk_create_tables,
    create_table,
    get_table_by_id,
    list_tables,
    remove_table,
    update_table,
    update_table_status,
)

router = APIRouter(prefix="/tables", tags=["tables"])

class StatusPatchPayload(BaseModel):
    status: str
    currentOrderId: Optional[str] = None
    runningTotal: Optional[float] = None

@router.get("", response_model=List[TableSchema], response_model_exclude_none=True)
def get_tables(
    floorId: Optional[str] = Query(None),
    includeInactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if floorId:
        floor = check_floor_access(current_user, floorId, db)
        return list_tables(
            db=db,
            floor_id=floor.id,
            include_inactive=includeInactive,
            is_admin=(current_user.role == "admin"),
        )

    # All tables
    allowed_ids = get_allowed_floor_ids_for_user(current_user, db)
    all_tables = list_tables(
        db=db,
        floor_id=None,
        include_inactive=includeInactive,
        is_admin=(current_user.role == "admin"),
    )
    if allowed_ids is not None:
        all_tables = [t for t in all_tables if t.floorId in allowed_ids]
    return all_tables

@router.post("/bulk", response_model=BulkCreateTablesResult, response_model_exclude_none=True)
def bulk_create(
    payload: BulkCreateTablesPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not payload.floorId:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid payload: floorId, from, and to are required.")
    created, skipped = bulk_create_tables(
        db=db,
        floor_id=payload.floorId,
        payload=payload,
        user_id=current_user.id,
    )
    return BulkCreateTablesResult(created=created, skippedNumbers=skipped)

@router.get("/{table_id}", response_model=TableSchema, response_model_exclude_none=True)
def get_single_table(
    table_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = get_table_by_id(db, table_id)
    check_floor_access(current_user, tbl.floorId, db)
    return tbl

@router.post("", response_model=TableSchema, status_code=status.HTTP_201_CREATED, response_model_exclude_none=True)
def create_single_table(
    payload: CreateTablePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return create_table(db, payload, user_id=current_user.id)

@router.put("/{table_id}", response_model=TableSchema, response_model_exclude_none=True)
def update_single_table(
    table_id: str,
    payload: UpdateTablePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return update_table(db, table_id, payload, user_id=current_user.id)

@router.delete("/{table_id}", response_model=DeleteResult)
def delete_single_table(
    table_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return remove_table(db, table_id, user_id=current_user.id)

@router.patch("/{table_id}/status", response_model=TableSchema, response_model_exclude_none=True)
def patch_table_status(
    table_id: str,
    payload: StatusPatchPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return update_table_status(
        db=db,
        table_id=table_id,
        status=payload.status,
        current_order_id=payload.currentOrderId,
        running_total=payload.runningTotal,
    )

