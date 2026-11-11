import logging
import math
import uuid
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.clock import get_business_date, now_utc
from app.core.config import settings
from app.core.database import write_transaction
from app.core.money import format_currency, round_money
from app.core.timeutil import compute_business_date, compute_order_date_fields
from app.models import Category, Floor, MenuItem, Order, OrderItem, Printer, Table
from app.schemas import (
    CreateOrderPayload,
    ListPaidResponseSchema,
    OrderItemSchema,
    OrderSchema,
    PayRequestPayload,
    PayResultSchema,
    PrintJobSchema,
    ReprintKitchenSlipPayload,
    SendItemsPayload,
    SendResultSchema,
    TableSchema,
    User,
    VoidItemPayload,
    VoidItemResultSchema,
)
from app.services.events import emit
from app.services.idempotency import check_idempotency, compute_request_hash, save_idempotency
from app.services.order_totals import calculate_order_totals
from app.services.printing.dispatcher import create_queued_print_job, dispatch_print_jobs
from app.services.tables import get_table_schema

logger = logging.getLogger("pos.services.orders")


def serialize_order_item(item: OrderItem) -> OrderItemSchema:
    is_voided = bool(item.voided or item.status == "cancelled")
    void_reason = item.void_reason or item.cancel_reason
    voided_at_str = None
    if item.voided_at:
        voided_at_str = item.voided_at.isoformat() + "Z"
    elif item.cancelled_at:
        voided_at_str = item.cancelled_at.isoformat() + "Z"

    return OrderItemSchema(
        id=item.id,
        menuItemId=item.menu_item_id,
        name=item.name,
        price=round_money(item.price),
        qty=item.qty,
        note=item.note,
        batchNo=item.batch_no,
        sentAt=item.sent_at.isoformat() + "Z" if item.sent_at else "",
        categoryId=item.category_id,
        printerId=item.printer_id,
        status="cancelled" if is_voided else (item.status or "sent"),
        voided=is_voided,
        voidReason=void_reason,
        voidedAt=voided_at_str,
        voidedBy=item.voided_by,
        cancelReason=void_reason,
        cancelledAt=voided_at_str,
    )


def serialize_order(order: Order) -> OrderSchema:
    return OrderSchema(
        id=order.id,
        tableId=order.table_id,
        floorId=order.floor_id,
        waiterId=order.waiter_id,
        status=order.status,
        items=[serialize_order_item(i) for i in order.items],
        subtotal=round_money(order.subtotal or 0.0),
        tax=round_money(order.tax or 0.0),
        serviceCharge=round_money(order.service_charge or 0.0),
        discount=round_money(order.discount or 0.0),
        discountType=order.discount_type,
        discountValue=order.discount_value,
        total=round_money(order.total or 0.0),
        createdAt=order.created_at.isoformat() + "Z" if order.created_at else "",
        billNo=order.bill_no,
        paymentMethod=order.payment_method,
        amountReceived=order.amount_received,
        changeDue=order.change_due,
        paidAt=order.paid_at.isoformat() + "Z" if order.paid_at else None,
        paidBy=order.paid_by,
    )


def check_user_floor_access(user: User, floor_id: str):
    if user.role != "admin" and user.allowedFloors:
        # Check against allowedFloors (slugs or IDs)
        if floor_id not in user.allowedFloors and f"floor-{floor_id.replace('f', '')}" not in user.allowedFloors:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to floor denied",
            )


def get_open_order_by_table(table_id: str, user: User, db: Session) -> Optional[OrderSchema]:
    order = (
        db.query(Order)
        .filter(Order.table_id == table_id, Order.status == "open")
        .first()
    )
    if not order:
        return None

    check_user_floor_access(user, order.floor_id)
    return serialize_order(order)


def get_order_by_id(order_id: str, user: User, db: Session) -> OrderSchema:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    check_user_floor_access(user, order.floor_id)
    return serialize_order(order)


def list_orders(
    user: User,
    db: Session,
    table_id: Optional[str] = None,
    floor_id: Optional[str] = None,
) -> List[OrderSchema]:
    query = db.query(Order)
    if table_id:
        query = query.filter(Order.table_id == table_id)
    if floor_id:
        query = query.filter(Order.floor_id == floor_id)

    orders = query.all()
    filtered = []
    for o in orders:
        if user.role == "admin" or not user.allowedFloors or o.floor_id in user.allowedFloors:
            filtered.append(serialize_order(o))
    return filtered


def create_order(payload: CreateOrderPayload, user: User, db: Session) -> OrderSchema:
    table = db.query(Table).filter(Table.id == payload.tableId, Table.is_deleted == False).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    check_user_floor_access(user, table.floor_id)

    existing_open = (
        db.query(Order)
        .filter(Order.table_id == table.id, Order.status == "open")
        .first()
    )
    if existing_open:
        return serialize_order(existing_open)

    with write_transaction(db):
        order_id = f"ord-{uuid.uuid4().hex[:10]}"
        new_order = Order(
            id=order_id,
            table_id=table.id,
            floor_id=table.floor_id,
            waiter_id=payload.waiterId or user.id,
            status="open",
            subtotal=0.0,
            tax=0.0,
            service_charge=0.0,
            discount=0.0,
            total=0.0,
            created_at=now_utc(),
        )
        db.add(new_order)
        table.status = "occupied"
        table.current_order_id = new_order.id

    emit("order.updated", {"orderId": new_order.id, "tableId": table.id, "floorId": table.floor_id})
    emit("table.updated", {"tableId": table.id, "floorId": table.floor_id, "status": "occupied", "runningTotal": 0.0})

    return serialize_order(new_order)


def send_items(payload: SendItemsPayload, user: User, db: Session) -> SendResultSchema:
    req_hash = compute_request_hash(payload)
    cached = check_idempotency(db, payload.requestId, "send_items", req_hash)
    if cached:
        return SendResultSchema(**cached[1])

    table = db.query(Table).filter(Table.id == payload.tableId, Table.is_deleted == False).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if not table.is_active:
        raise HTTPException(status_code=400, detail="Table is inactive")

    check_user_floor_access(user, table.floor_id)

    if not payload.items or len(payload.items) == 0:
        raise HTTPException(status_code=422, detail="No items to send")
    if len(payload.items) > 100:
        raise HTTPException(status_code=422, detail="Exceeded maximum of 100 items per batch")

    # Validate each item
    for draft in payload.items:
        if not (1 <= draft.qty <= 99):
            raise HTTPException(status_code=422, detail=f"Quantity must be between 1 and 99 (received {draft.qty})")
        if draft.note and len(draft.note) > 200:
            raise HTTPException(status_code=422, detail="Note must be at most 200 characters")

        menu_item = db.query(MenuItem).filter(MenuItem.id == draft.menuItemId, MenuItem.is_deleted == False).first()
        if not menu_item:
            raise HTTPException(status_code=404, detail=f"Menu item {draft.menuItemId} not found")
        if not menu_item.is_active:
            raise HTTPException(status_code=400, detail=f"{menu_item.name} is inactive")
        if menu_item.floor_id != table.floor_id:
            raise HTTPException(
                status_code=422,
                detail=f"Item {menu_item.name} is not on floor {table.floor_id}",
            )
        if not menu_item.available:
            raise HTTPException(
                status_code=422,
                detail=f"{menu_item.name} is currently marked unavailable",
            )

    job_ids: List[str] = []
    order_id: str = ""
    batch_no: int = 1

    with write_transaction(db):
        order = (
            db.query(Order)
            .filter(Order.table_id == table.id, Order.status == "open")
            .first()
        )

        if not order:
            order_id = f"ord-{uuid.uuid4().hex[:10]}"
            order = Order(
                id=order_id,
                table_id=table.id,
                floor_id=table.floor_id,
                waiter_id=user.id,
                status="open",
                subtotal=0.0,
                tax=0.0,
                service_charge=0.0,
                discount=0.0,
                total=0.0,
                created_at=now_utc(),
            )
            db.add(order)
            table.status = "occupied"
            table.current_order_id = order.id
            batch_no = 1
        else:
            order_id = order.id
            batch_no = max([i.batch_no for i in order.items], default=0) + 1

        new_order_items: List[OrderItem] = []
        for draft in payload.items:
            menu_item = db.query(MenuItem).filter(MenuItem.id == draft.menuItemId).first()
            cat = db.query(Category).filter(Category.id == menu_item.category_id).first()
            prn_id = cat.printer_id if cat else "prn-kitchen"

            oi = OrderItem(
                id=f"oi-{uuid.uuid4().hex[:10]}",
                order_id=order.id,
                menu_item_id=menu_item.id,
                name=menu_item.name,
                price=menu_item.price,
                qty=draft.qty,
                note=draft.note,
                batch_no=batch_no,
                category_id=menu_item.category_id,
                printer_id=prn_id,
                sent_at=now_utc(),
                status="sent",
                voided=False,
            )
            db.add(oi)
            order.items.append(oi)
            new_order_items.append(oi)

        # Recalculate totals
        totals = calculate_order_totals(order.items, order.discount_type, order.discount_value)
        order.subtotal = totals.subtotal
        order.tax = totals.tax
        order.service_charge = totals.service_charge
        order.discount = totals.discount
        order.total = totals.total

        # Group by category for print jobs
        cat_map: Dict[str, List[OrderItem]] = {}
        for oi in new_order_items:
            cat_map.setdefault(oi.category_id, []).append(oi)

        floor = db.query(Floor).filter(Floor.id == table.floor_id).first()
        floor_name = floor.name if floor else "Main Floor"

        for cat_id, cat_items in cat_map.items():
            cat = db.query(Category).filter(Category.id == cat_id).first()
            prn = db.query(Printer).filter(Printer.id == cat.printer_id).first() if cat else None
            p_id = prn.id if prn else "prn-kitchen"
            p_name = f"{prn.name} ({prn.ip})" if prn else "Kitchen Printer"
            cat_name = cat.name if cat else "Kitchen"

            snapshot = {
                "v": 1,
                "kind": "kitchen",
                "orderId": order.id,
                "tableNumber": table.number,
                "floorName": floor_name,
                "waiterName": user.name,
                "batchNo": batch_no,
                "categoryId": cat_id,
                "categoryName": cat_name,
                "printerName": prn.name if prn else "Kitchen Printer",
                "items": [{"name": i.name, "qty": i.qty, "note": i.note} for i in cat_items],
            }
            pj = create_queued_print_job(
                db=db,
                kind="kitchen",
                printer_id=p_id,
                order_id=order.id,
                payload_snapshot=snapshot,
                category_id=cat_id,
                category_name=cat_name,
                printer_name=p_name,
            )
            job_ids.append(pj.id)

        from app.services import audit
        audit.record(
            session=db,
            event="order.send",
            user_id=user.id,
            role=user.role,
            request_id=payload.requestId,
            entity="order",
            entity_id=order.id,
            details={
                "orderId": order.id,
                "tableId": table.id,
                "floorId": table.floor_id,
                "batchNo": batch_no,
                "itemsCount": len(new_order_items),
                "total": order.total,
            },
        )

        db.flush()

    # Out of transaction
    print_jobs = dispatch_print_jobs(job_ids, db)

    emit("order.updated", {"orderId": order_id, "tableId": table.id})
    emit("table.updated", {"tableId": table.id, "status": "occupied", "runningTotal": order.total})

    saved_order = db.query(Order).filter(Order.id == order_id).first()
    send_result = SendResultSchema(
        order=serialize_order(saved_order),
        batchNo=batch_no,
        printJobs=print_jobs,
    )

    save_idempotency(db, payload.requestId, "send_items", order_id, req_hash, send_result, 200)
    db.commit()

    return send_result


def reprint_kitchen_slip(payload: ReprintKitchenSlipPayload, user: User, db: Session) -> PrintJobSchema:
    order = db.query(Order).filter(Order.id == payload.orderId).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    check_user_floor_access(user, order.floor_id)

    matched_items = [
        i for i in order.items
        if i.batch_no == payload.batchNo and i.category_id == payload.categoryId and not i.voided
    ]
    if not matched_items:
        raise HTTPException(status_code=404, detail="No active items found for this batch and category")

    cat = db.query(Category).filter(Category.id == payload.categoryId).first()
    prn = db.query(Printer).filter(Printer.id == cat.printer_id).first() if cat else None
    p_id = prn.id if prn else "prn-kitchen"
    p_name = f"{prn.name} ({prn.ip})" if prn else "Kitchen Printer"
    cat_name = cat.name if cat else "Kitchen"

    table = db.query(Table).filter(Table.id == order.table_id).first()
    floor = db.query(Floor).filter(Floor.id == order.floor_id).first()
    floor_name = floor.name if floor else "Main Floor"

    with write_transaction(db):
        snapshot = {
            "v": 1,
            "kind": "kitchen_reprint",
            "reprint": True,
            "orderId": order.id,
            "tableNumber": table.number if table else "",
            "floorName": floor_name,
            "waiterName": user.name,
            "batchNo": payload.batchNo,
            "categoryId": payload.categoryId,
            "categoryName": cat_name,
            "printerName": prn.name if prn else "Kitchen Printer",
            "items": [{"name": i.name, "qty": i.qty, "note": i.note} for i in matched_items],
        }
        pj = create_queued_print_job(
            db=db,
            kind="kitchen",
            printer_id=p_id,
            order_id=order.id,
            payload_snapshot=snapshot,
            category_id=payload.categoryId,
            category_name=cat_name,
            printer_name=p_name,
        )

        from app.services import audit
        audit.record(
            session=db,
            event="order.reprint_batch",
            user_id=user.id,
            role=user.role,
            entity="order",
            entity_id=order.id,
            details={"orderId": order.id, "batchNo": payload.batchNo, "categoryId": payload.categoryId},
        )

        db.flush()
        pj_id = pj.id

    pjs = dispatch_print_jobs([pj_id], db)
    return pjs[0] if pjs else PrintJobSchema(printerId=p_id, printerName=p_name, status="failed", error="Dispatch failed")


def pay_order(order_id: str, payload: PayRequestPayload, user: User, db: Session) -> PayResultSchema:
    req_hash = compute_request_hash(payload)
    cached = check_idempotency(db, payload.requestId, "pay_order", req_hash)
    if cached:
        return PayResultSchema(**cached[1])

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status == "paid":
        raise HTTPException(status_code=409, detail="Order already paid")

    check_user_floor_access(user, order.floor_id)

    if (payload.discountType or (payload.discountValue is not None and payload.discountValue > 0)):
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admin can apply discount")

    active_items = [i for i in order.items if not i.voided and i.status != "cancelled"]
    if len(active_items) == 0:
        raise HTTPException(status_code=422, detail="Cannot pay an order with no active items")

    totals = calculate_order_totals(order.items, payload.discountType, payload.discountValue)

    method = payload.method or "cash"
    amount_received = payload.amountReceived
    change_due = 0.0

    if method == "cash":
        if amount_received is None or round_money(amount_received) < totals.total:
            formatted_min = format_currency(totals.total)
            raise HTTPException(
                status_code=422,
                detail=f"Amount received must be at least {formatted_min}",
            )
        change_due = round_money(amount_received - totals.total)
    else:
        amount_received = totals.total
        change_due = 0.0

    pj_id = ""
    table_id = order.table_id

    with write_transaction(db):
        biz_date = get_business_date()
        db.execute(
            text(
                "INSERT INTO daily_sequences(business_date, last_seq) VALUES(:d, 1) "
                "ON CONFLICT(business_date) DO UPDATE SET last_seq = daily_sequences.last_seq + 1"
            ),
            {"d": biz_date},
        )
        last_seq = db.execute(
            text("SELECT last_seq FROM daily_sequences WHERE business_date = :d"),
            {"d": biz_date},
        ).scalar_one()

        bill_no = f"B-{last_seq:04d}"

        paid_now = now_utc()
        b_date, local_hour, local_wday = compute_order_date_fields(paid_now, start_hour=settings.BUSINESS_DAY_START_HOUR)

        order.status = "paid"
        order.bill_no = bill_no
        order.payment_method = method
        order.subtotal = totals.subtotal
        order.service_charge = totals.service_charge
        order.tax = totals.tax
        order.discount = totals.discount
        order.discount_type = payload.discountType
        order.discount_value = payload.discountValue
        order.total = totals.total
        order.amount_received = amount_received
        order.change_due = change_due
        order.paid_at = paid_now
        order.paid_by = user.id
        order.business_date = b_date
        order.paid_local_hour = local_hour
        order.paid_local_weekday = local_wday

        table = db.query(Table).filter(Table.id == table_id).first()
        if table:
            table.status = "free"
            table.current_order_id = None

        prn = (
            db.query(Printer).filter(Printer.id == settings.CASHIER_PRINTER_ID).first()
            or db.query(Printer).filter(Printer.role == "cashier", Printer.is_active == True).first()
        )
        prn_id = prn.id if prn else settings.CASHIER_PRINTER_ID
        prn_name = f"{prn.name} ({prn.ip})" if prn else "Cashier Thermal Printer (192.168.1.103)"

        floor = db.query(Floor).filter(Floor.id == order.floor_id).first()
        floor_name = floor.name if floor else "Main Floor"

        snapshot = {
            "v": 1,
            "kind": "bill",
            "billNo": bill_no,
            "orderId": order.id,
            "tableNumber": table.number if table else "",
            "floorName": floor_name,
            "waiterName": user.name,
            "printerName": prn.name if prn else "Cashier Printer",
            "paymentMethod": method,
            "subtotal": totals.subtotal,
            "discount": totals.discount,
            "tax": totals.tax,
            "serviceCharge": totals.service_charge,
            "total": totals.total,
            "amountReceived": amount_received,
            "changeDue": change_due,
            "items": [
                {"name": i.name, "qty": i.qty, "price": i.price, "total": round_money(i.price * i.qty)}
                for i in active_items
            ],
        }

        pj = create_queued_print_job(
            db=db,
            kind="bill",
            printer_id=prn_id,
            order_id=order.id,
            payload_snapshot=snapshot,
            category_id="cashier",
            category_name="Cashier",
            printer_name=prn_name,
        )

        from app.services import audit
        if totals.discount > 0:
            audit.record(
                session=db,
                event="order.discount",
                user_id=user.id,
                role=user.role,
                request_id=payload.requestId,
                entity="order",
                entity_id=order.id,
                details={
                    "orderId": order.id,
                    "type": payload.discount.type,
                    "value": payload.discount.value,
                    "amount": totals.discount,
                    "who": user.username,
                },
            )

        audit.record(
            session=db,
            event="order.pay",
            user_id=user.id,
            role=user.role,
            request_id=payload.requestId,
            entity="order",
            entity_id=order.id,
            details={
                "orderId": order.id,
                "billNo": bill_no,
                "total": totals.total,
                "method": payload.method,
            },
        )

        db.flush()
        pj_id = pj.id

    # Post-commit
    pjs = dispatch_print_jobs([pj_id], db)
    bill_pj = pjs[0] if pjs else PrintJobSchema(
        printerId=prn_id,
        printerName=prn_name,
        categoryId="cashier",
        categoryName="Cashier",
        status="printed",
    )

    emit("order.updated", {"orderId": order.id, "tableId": table_id, "floorId": order.floor_id})
    emit("bill.paid", {"orderId": order.id, "billNo": bill_no, "total": order.total})
    emit("table.updated", {"tableId": table_id, "status": "free", "runningTotal": 0})

    saved_order = db.query(Order).filter(Order.id == order_id).first()
    saved_table = db.query(Table).filter(Table.id == table_id).first()
    table_schema = (
        get_table_schema(saved_table, db)
        if saved_table
        else TableSchema(id=table_id, floorId=order.floor_id, number=0, capacity=4, status="free")
    )

    pay_result = PayResultSchema(
        order=serialize_order(saved_order),
        billPrintJob=bill_pj,
        table=table_schema,
    )

    save_idempotency(db, payload.requestId, "pay_order", order_id, req_hash, pay_result, 200)
    db.commit()

    return pay_result


def reprint_bill(order_id: str, user: User, db: Session) -> PrintJobSchema:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != "paid":
        raise HTTPException(status_code=400, detail="Cannot reprint bill for unpaid order")

    check_user_floor_access(user, order.floor_id)

    prn = (
        db.query(Printer).filter(Printer.id == settings.CASHIER_PRINTER_ID).first()
        or db.query(Printer).filter(Printer.role == "cashier", Printer.is_active == True).first()
    )
    prn_id = prn.id if prn else settings.CASHIER_PRINTER_ID
    prn_name = f"{prn.name} ({prn.ip})" if prn else "Cashier Thermal Printer (192.168.1.103)"

    table = db.query(Table).filter(Table.id == order.table_id).first()
    floor = db.query(Floor).filter(Floor.id == order.floor_id).first()
    floor_name = floor.name if floor else "Main Floor"
    active_items = [i for i in order.items if not i.voided and i.status != "cancelled"]

    with write_transaction(db):
        snapshot = {
            "v": 1,
            "kind": "bill_reprint",
            "reprint": True,
            "billNo": order.bill_no,
            "orderId": order.id,
            "tableNumber": table.number if table else "",
            "floorName": floor_name,
            "waiterName": user.name,
            "printerName": prn.name if prn else "Cashier Printer",
            "paymentMethod": order.payment_method,
            "subtotal": order.subtotal,
            "discount": order.discount,
            "tax": order.tax,
            "serviceCharge": order.service_charge,
            "total": order.total,
            "amountReceived": order.amount_received,
            "changeDue": order.change_due,
            "items": [
                {"name": i.name, "qty": i.qty, "price": i.price, "total": round_money(i.price * i.qty)}
                for i in active_items
            ],
        }
        pj = create_queued_print_job(
            db=db,
            kind="bill",
            printer_id=prn_id,
            order_id=order.id,
            payload_snapshot=snapshot,
            category_id="cashier",
            category_name="Cashier",
            printer_name=prn_name,
        )

        from app.services import audit
        audit.record(
            session=db,
            event="order.reprint_bill",
            user_id=user.id,
            role=user.role,
            entity="order",
            entity_id=order.id,
            details={"orderId": order.id, "billNo": order.bill_no},
        )

        db.flush()
        pj_id = pj.id

    pjs = dispatch_print_jobs([pj_id], db)
    return pjs[0] if pjs else PrintJobSchema(
        printerId=prn_id,
        printerName=prn_name,
        categoryId="cashier",
        categoryName="Cashier",
        status="printed",
    )


def void_item(order_id: str, payload: VoidItemPayload, user: User, db: Session) -> VoidItemResultSchema:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required to cancel order items")

    if payload.requestId:
        req_hash = compute_request_hash(payload)
        cached = check_idempotency(db, payload.requestId, "void_item", req_hash)
        if cached:
            return VoidItemResultSchema(**cached[1])

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != "open":
        raise HTTPException(status_code=409, detail="Cannot void items on closed or paid order")

    # Target item lookup
    target_item = None
    for item in order.items:
        if payload.orderItemId and item.id == payload.orderItemId:
            target_item = item
            break
        elif payload.menuItemId and item.menu_item_id == payload.menuItemId:
            if payload.batchNo is None or item.batch_no == payload.batchNo:
                target_item = item
                break

    if not target_item:
        raise HTTPException(status_code=404, detail="Order item not found")

    if target_item.voided or target_item.status == "cancelled":
        raise HTTPException(status_code=400, detail="Item is already cancelled")

    pj_id = ""
    table_id = order.table_id

    with write_transaction(db):
        void_now = now_utc()
        target_item.voided = True
        target_item.status = "cancelled"
        reason = payload.reason or "Customer cancelled"
        target_item.void_reason = reason
        target_item.cancel_reason = reason
        target_item.voided_at = void_now
        target_item.cancelled_at = void_now
        target_item.voided_by = user.name
        target_item.voided_business_date = compute_business_date(void_now, start_hour=settings.BUSINESS_DAY_START_HOUR)

        totals = calculate_order_totals(order.items, order.discount_type, order.discount_value)
        order.subtotal = totals.subtotal
        order.tax = totals.tax
        order.service_charge = totals.service_charge
        order.discount = totals.discount
        order.total = totals.total

        table = db.query(Table).filter(Table.id == table_id).first()

        cat = db.query(Category).filter(Category.id == target_item.category_id).first()
        prn = db.query(Printer).filter(Printer.id == cat.printer_id).first() if cat else None
        p_id = prn.id if prn else "prn-kitchen"
        p_name = f"{prn.name} ({prn.ip})" if prn else "Kitchen Printer"

        floor = db.query(Floor).filter(Floor.id == order.floor_id).first()
        floor_name = floor.name if floor else "Main Floor"

        snapshot = {
            "v": 1,
            "kind": "cancel",
            "orderId": order.id,
            "tableNumber": table.number if table else "",
            "floorName": floor_name,
            "categoryName": cat.name if cat else "Kitchen",
            "itemId": target_item.id,
            "name": target_item.name,
            "qty": target_item.qty,
            "reason": reason,
            "voidedBy": user.name,
        }

        pj = create_queued_print_job(
            db=db,
            kind="cancel",
            printer_id=p_id,
            order_id=order.id,
            payload_snapshot=snapshot,
            category_id=target_item.category_id,
            category_name=cat.name if cat else "Kitchen",
            printer_name=p_name,
        )

        from app.services import audit
        audit.record(
            session=db,
            event="order.void",
            user_id=user.id,
            role=user.role,
            request_id=payload.requestId,
            entity="order_item",
            entity_id=target_item.id,
            details={
                "orderId": order.id,
                "itemId": target_item.id,
                "item": target_item.name,
                "amount": round_money(target_item.price * target_item.qty),
                "reason": reason,
                "voidedBy": user.username,
            },
        )

        db.flush()
        pj_id = pj.id

    pjs = dispatch_print_jobs([pj_id], db)
    pj_schema = pjs[0] if pjs else PrintJobSchema(
        printerId=p_id,
        printerName=p_name,
        categoryId=target_item.category_id,
        status="printed",
    )

    emit("order.updated", {"orderId": order.id, "tableId": table_id})
    if table:
        emit("table.updated", {"tableId": table.id, "status": table.status, "runningTotal": totals.total})

    saved_order = db.query(Order).filter(Order.id == order_id).first()
    saved_item = db.query(OrderItem).filter(OrderItem.id == target_item.id).first()

    res = VoidItemResultSchema(
        order=serialize_order(saved_order),
        printJob=pj_schema,
        cancelPrintJobs=[pj_schema],
        voidedItem=serialize_order_item(saved_item),
    )

    if payload.requestId:
        save_idempotency(db, payload.requestId, "void_item", order.id, req_hash, res, 200)
        db.commit()

    return res


def list_paid_orders(
    user: User,
    db: Session,
    date: Optional[str] = None,
    floor_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> ListPaidResponseSchema:
    query = db.query(Order).filter(Order.status == "paid")

    if floor_id:
        query = query.filter(Order.floor_id == floor_id)
    elif user.role != "admin" and user.allowedFloors:
        query = query.filter(Order.floor_id.in_(user.allowedFloors))

    if payment_method:
        query = query.filter(Order.payment_method == payment_method)

    all_paid = query.order_by(Order.paid_at.desc()).all()

    # In-memory filter for date string prefix and search
    filtered: List[Order] = []
    for o in all_paid:
        if date:
            if not o.paid_at or not o.paid_at.strftime("%Y-%m-%d").startswith(date):
                continue
        if search:
            q = search.lower().strip()
            matches_bill = bool(o.bill_no and q in o.bill_no.lower())
            table = db.query(Table).filter(Table.id == o.table_id).first()
            matches_table = bool(table and q in str(table.number))
            if not (matches_bill or matches_table):
                continue
        filtered.append(o)

    total = len(filtered)
    total_amount = round_money(sum(o.total or 0.0 for o in filtered))

    page_num = max(1, page)
    limit_num = max(1, limit)
    start = (page_num - 1) * limit_num
    page_orders = filtered[start : start + limit_num]

    serialized_items = [serialize_order(o) for o in page_orders]
    total_pages = math.ceil(total / limit_num) if total > 0 else 1

    return ListPaidResponseSchema(
        items=serialized_items,
        orders=serialized_items,
        total=total,
        page=page_num,
        limit=limit_num,
        totalAmount=total_amount,
        totalPages=total_pages,
    )


def cancel_order(order_id: str, user: User, db: Session) -> OrderSchema:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status == "paid":
        raise HTTPException(status_code=400, detail="Cannot cancel paid order")

    check_user_floor_access(user, order.floor_id)

    table_id = order.table_id

    with write_transaction(db):
        order.status = "cancelled"
        for item in order.items:
            item.status = "cancelled"
            item.voided = True
            item.void_reason = "Order cancelled"
            item.cancelled_at = now_utc()

        table = db.query(Table).filter(Table.id == table_id).first()
        if table and table.current_order_id == order.id:
            table.status = "free"
            table.current_order_id = None

    emit("order.updated", {"orderId": order.id, "tableId": table_id})
    if table:
        emit("table.updated", {"tableId": table.id, "status": "free", "runningTotal": 0})

    saved_order = db.query(Order).filter(Order.id == order_id).first()
    return serialize_order(saved_order)
