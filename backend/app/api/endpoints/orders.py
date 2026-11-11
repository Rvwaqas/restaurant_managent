from typing import List, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.database import get_db
from app.schemas import (
    CreateOrderPayload,
    ListPaidResponseSchema,
    OrderSchema,
    PayRequestPayload,
    PayResultSchema,
    PrintJobSchema,
    ReprintKitchenSlipPayload,
    SendItemsPayload,
    SendResultSchema,
    User,
    VoidItemPayload,
    VoidItemResultSchema,
)
from app.services import orders as orders_service

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("/open", response_model=Optional[OrderSchema])
def get_open_order_by_table(
    tableId: str = Query(..., description="ID of table"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.get_open_order_by_table(tableId, current_user, db)


@router.get("/paid", response_model=ListPaidResponseSchema)
def list_paid_orders(
    date: Optional[str] = Query(None, description="Date filter YYYY-MM-DD"),
    floorId: Optional[str] = Query(None, description="Floor ID filter"),
    paymentMethod: Optional[str] = Query(None, description="Payment method: cash, card, online"),
    search: Optional[str] = Query(None, description="Search term for bill or table number"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.list_paid_orders(
        user=current_user,
        db=db,
        date=date,
        floor_id=floorId,
        payment_method=paymentMethod,
        search=search,
        page=page,
        limit=limit,
    )


@router.get("", response_model=List[OrderSchema])
def list_orders(
    tableId: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.list_orders(
        user=current_user,
        db=db,
        table_id=tableId,
        floor_id=floorId,
    )


@router.get("/{order_id}", response_model=OrderSchema)
def get_order_by_id(
    order_id: str = Path(..., description="ID of order"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.get_order_by_id(order_id, current_user, db)


@router.post("", response_model=OrderSchema)
def create_order(
    payload: CreateOrderPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.create_order(payload, current_user, db)


@router.post("/send", response_model=SendResultSchema)
def send_items(
    payload: SendItemsPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.send_items(payload, current_user, db)


@router.post("/reprint", response_model=PrintJobSchema)
def reprint_kitchen_slip(
    payload: ReprintKitchenSlipPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.reprint_kitchen_slip(payload, current_user, db)


@router.post("/{order_id}/pay", response_model=PayResultSchema)
def pay_order(
    order_id: str = Path(...),
    payload: PayRequestPayload = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.pay_order(order_id, payload, current_user, db)


@router.post("/{order_id}/reprint-bill", response_model=PrintJobSchema)
def reprint_bill(
    order_id: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.reprint_bill(order_id, current_user, db)


@router.post("/{order_id}/void-item", response_model=VoidItemResultSchema)
def void_item(
    order_id: str = Path(...),
    payload: VoidItemPayload = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.void_item(order_id, payload, current_user, db)


@router.post("/{order_id}/cancel", response_model=OrderSchema)
def cancel_order(
    order_id: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return orders_service.cancel_order(order_id, current_user, db)
