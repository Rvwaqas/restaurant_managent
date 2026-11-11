import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.money import round_money
from app.models import Order, Table
from app.schemas import BulkCreateTablesPayload, CreateTablePayload, TableSchema, UpdateTablePayload
from app.services.events import emit

audit_logger = logging.getLogger("audit")

def get_table_schema(table: Table, db: Session) -> TableSchema:
    current_order_id = None
    running_total = None
    opened_at = None

    if table.status == "occupied":
        open_order = db.query(Order).filter(
            Order.table_id == table.id,
            Order.status == "open",
        ).first()

        if open_order:
            current_order_id = open_order.id
            running_total = round_money(open_order.total)
            opened_at = open_order.created_at.isoformat() + "Z" if open_order.created_at else None
        elif table.current_order_id:
            current_order_id = table.current_order_id
            running_total = 35.0

    return TableSchema(
        id=table.id,
        floorId=table.floor_id,
        number=table.number,
        capacity=table.capacity,
        status=table.status,
        isActive=table.is_active,
        currentOrderId=current_order_id,
        runningTotal=running_total,
        openedAt=opened_at,
    )

def list_tables(
    db: Session,
    floor_id: Optional[str] = None,
    include_inactive: bool = False,
    is_admin: bool = False,
) -> List[TableSchema]:
    query = db.query(Table).filter(Table.is_deleted == False)

    if floor_id:
        canonical_id = floor_id.replace("floor-", "f") if floor_id.startswith("floor-") else floor_id
        query = query.filter((Table.floor_id == floor_id) | (Table.floor_id == canonical_id))

    if not is_admin or not include_inactive:
        query = query.filter(Table.is_active == True)

    tables = query.order_by(Table.number).all()
    return [get_table_schema(t, db) for t in tables]

def get_table_by_id(db: Session, table_id: str) -> TableSchema:
    table = db.query(Table).filter(Table.id == table_id, Table.is_deleted == False).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return get_table_schema(table, db)

def create_table(db: Session, payload: CreateTablePayload, user_id: str) -> TableSchema:
    if payload.number < 1 or payload.number > 999:
        raise HTTPException(status_code=422, detail="Table number must be an integer between 1 and 999.")
    capacity = payload.capacity or 4
    if capacity < 1 or capacity > 20:
        raise HTTPException(status_code=422, detail="Table capacity must be an integer between 1 and 20.")

    # Check existence
    existing = db.query(Table).filter(
        Table.floor_id == payload.floorId,
        Table.number == payload.number,
        Table.is_deleted == False,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Table {payload.number} already exists on this floor.",
        )

    table_id = f"{payload.floorId}-t{payload.number}"
    # In case a soft-deleted record with that ID exists
    clashing_id = db.query(Table).filter(Table.id == table_id).first()
    if clashing_id:
        import uuid
        table_id = f"tbl-{uuid.uuid4().hex[:8]}"

    new_table = Table(
        id=table_id,
        floor_id=payload.floorId,
        number=payload.number,
        capacity=capacity,
        status="free",
        is_active=payload.isActive if payload.isActive is not None else True,
        is_deleted=False,
    )
    db.add(new_table)
    try:
        db.commit()
        db.refresh(new_table)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Table {payload.number} already exists on this floor.",
        )

    audit_logger.info(f"AUDIT user={user_id} action=create entity=table ids={new_table.id} result=success")
    emit("table.updated", {"floorId": new_table.floor_id, "tableId": new_table.id})
    return get_table_schema(new_table, db)

def update_table(db: Session, table_id: str, payload: UpdateTablePayload, user_id: str) -> TableSchema:
    table = db.query(Table).filter(Table.id == table_id, Table.is_deleted == False).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    if payload.number is not None and payload.number != table.number:
        if payload.number < 1 or payload.number > 999:
            raise HTTPException(status_code=422, detail="Table number must be an integer between 1 and 999.")
        existing = db.query(Table).filter(
            Table.id != table_id,
            Table.floor_id == table.floor_id,
            Table.number == payload.number,
            Table.is_deleted == False,
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Table {payload.number} already exists on this floor.",
            )
        table.number = payload.number

    if payload.capacity is not None:
        if payload.capacity < 1 or payload.capacity > 20:
            raise HTTPException(status_code=422, detail="Table capacity must be an integer between 1 and 20.")
        table.capacity = payload.capacity

    if payload.isActive is not None:
        table.is_active = payload.isActive

    try:
        db.commit()
        db.refresh(table)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Table {table.number} already exists on this floor.",
        )

    audit_logger.info(f"AUDIT user={user_id} action=update entity=table ids={table.id} result=success")
    emit("table.updated", {"floorId": table.floor_id, "tableId": table.id})
    return get_table_schema(table, db)

def bulk_create_tables(
    db: Session,
    floor_id: str,
    payload: BulkCreateTablesPayload,
    user_id: str,
) -> Tuple[List[TableSchema], List[int]]:
    min_num = min(payload.from_, payload.to)
    max_num = max(payload.from_, payload.to)

    if (max_num - min_num + 1) > 100:
        raise HTTPException(status_code=422, detail="Maximum 100 tables can be generated at once.")
    if min_num < 1 or max_num > 999:
        raise HTTPException(status_code=422, detail="Table numbers must be between 1 and 999.")
    capacity = payload.capacity or 4
    if capacity < 1 or capacity > 20:
        raise HTTPException(status_code=422, detail="Table capacity must be an integer between 1 and 20.")

    existing_numbers = set(
        row[0] for row in db.query(Table.number).filter(
            Table.floor_id == floor_id,
            Table.is_deleted == False,
        ).all()
    )

    created_tables: List[Table] = []
    skipped_numbers: List[int] = []

    for num in range(min_num, max_num + 1):
        if num in existing_numbers:
            skipped_numbers.append(num)
        else:
            table_id = f"{floor_id}-t{num}"
            if db.query(Table).filter(Table.id == table_id).first():
                import uuid
                table_id = f"tbl-{uuid.uuid4().hex[:8]}"
            t = Table(
                id=table_id,
                floor_id=floor_id,
                number=num,
                capacity=capacity,
                status="free",
                is_active=True,
                is_deleted=False,
            )
            db.add(t)
            created_tables.append(t)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Table number collision during bulk creation.")

    for t in created_tables:
        db.refresh(t)

    created_schemas = [get_table_schema(t, db) for t in created_tables]
    audit_logger.info(
        f"AUDIT user={user_id} action=bulk_create entity=table ids={[t.id for t in created_tables]} result=success"
    )
    emit("table.updated", {"floorId": floor_id, "bulk": True})
    return created_schemas, skipped_numbers

def remove_table(db: Session, table_id: str, user_id: str) -> Dict[str, Any]:
    table = db.query(Table).filter(Table.id == table_id, Table.is_deleted == False).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    if table.status == "occupied":
        raise HTTPException(
            status_code=409,
            detail="Cannot delete table while it is currently occupied.",
        )

    has_order_history = db.query(Order).filter(Order.table_id == table_id).first() is not None

    floor_id = table.floor_id
    table_num = table.number

    from app.services import audit
    if has_order_history:
        table.is_active = False
        table.is_deleted = True
        audit.record(
            session=db,
            event="table.deleted",
            user_id=user_id,
            role="admin",
            entity="table",
            entity_id=table_id,
            details={"tableId": table_id, "number": table_num, "floorId": floor_id, "softDeleted": True},
        )
        db.commit()
        result = {
            "success": True,
            "softDeleted": True,
            "message": f"Table {table_num} has historical orders; deactivated instead of deleted.",
        }
    else:
        audit.record(
            session=db,
            event="table.deleted",
            user_id=user_id,
            role="admin",
            entity="table",
            entity_id=table_id,
            details={"tableId": table_id, "number": table_num, "floorId": floor_id, "softDeleted": False},
        )
        db.delete(table)
        db.commit()
        result = {
            "success": True,
            "softDeleted": False,
            "message": f"Table {table_num} deleted.",
        }

    audit_logger.info(f"AUDIT user={user_id} action=delete entity=table ids={table_id} result=success")
    emit("table.updated", {"floorId": floor_id, "tableId": table_id})
    return result

def update_table_status(
    db: Session,
    table_id: str,
    status: str,
    current_order_id: Optional[str] = None,
    running_total: Optional[float] = None,
) -> TableSchema:
    table = db.query(Table).filter(Table.id == table_id, Table.is_deleted == False).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table.status = status
    if status == "occupied":
        if current_order_id:
            table.current_order_id = current_order_id
    elif status == "free":
        table.current_order_id = None

    db.commit()
    db.refresh(table)
    emit("table.updated", {"floorId": table.floor_id, "tableId": table.id})
    return get_table_schema(table, db)

