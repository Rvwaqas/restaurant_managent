import ipaddress
import logging
import uuid
from typing import Any, Dict, List

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Category, Printer, PrintJob
from app.schemas import CreatePrinterPayload, PrinterSchema, TestPrintResult, UpdatePrinterPayload
from app.services.events import emit
from app.services.printing.driver import execute_test_print

audit_logger = logging.getLogger("audit")

def validate_ipv4(ip_str: str) -> str:
    ip_str = ip_str.strip()
    try:
        ipaddress.IPv4Address(ip_str)
        return ip_str
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid IPv4 address.")

def get_printer_schema(printer: Printer) -> PrinterSchema:
    return PrinterSchema(
        id=printer.id,
        name=printer.name,
        ip=printer.ip,
        port=printer.port,
        isActive=printer.is_active,
        role=printer.role,
    )

def list_printers(db: Session) -> List[PrinterSchema]:
    printers = db.query(Printer).order_by(Printer.name).all()
    return [get_printer_schema(p) for p in printers]

def get_printer_by_id(db: Session, printer_id: str) -> PrinterSchema:
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return get_printer_schema(printer)

def create_printer(db: Session, payload: CreatePrinterPayload, user_id: str) -> PrinterSchema:
    name_trimmed = payload.name.strip()
    if not name_trimmed or len(name_trimmed) > 100:
        raise HTTPException(status_code=422, detail="Printer name must be between 1 and 100 characters.")

    ip_valid = validate_ipv4(payload.ip)
    port = payload.port or 9100
    if port < 1 or port > 65535:
        raise HTTPException(status_code=422, detail="Port must be between 1 and 65535.")

    role = payload.role or "kitchen"
    if role not in ("kitchen", "cashier"):
        raise HTTPException(status_code=422, detail="Role must be either 'kitchen' or 'cashier'.")

    # Check name duplicate
    existing_name = db.query(Printer).filter(func.lower(Printer.name) == name_trimmed.lower()).first()
    if existing_name:
        raise HTTPException(status_code=409, detail=f'A printer named "{name_trimmed}" already exists.')

    # Check ip/port duplicate
    existing_addr = db.query(Printer).filter(Printer.ip == ip_valid, Printer.port == port).first()
    if existing_addr:
        raise HTTPException(
            status_code=409,
            detail=f"A printer with address {ip_valid}:{port} already exists.",
        )

    printer_id = f"prn-{uuid.uuid4().hex[:8]}"
    new_printer = Printer(
        id=printer_id,
        name=name_trimmed,
        ip=ip_valid,
        port=port,
        is_active=payload.isActive if payload.isActive is not None else True,
        role=role,
    )
    db.add(new_printer)
    from app.services import audit
    audit.record(
        session=db,
        event="printer.created",
        user_id=user_id,
        role="admin",
        entity="printer",
        entity_id=new_printer.id,
        details={"printerId": new_printer.id, "name": new_printer.name, "role": new_printer.role, "ip": new_printer.ip, "port": new_printer.port},
    )

    try:
        db.commit()
        db.refresh(new_printer)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Printer uniqueness constraint violated.")

    audit_logger.info(f"AUDIT user={user_id} action=create entity=printer ids={new_printer.id} result=success")
    emit("printer.status", {"printerId": new_printer.id})
    return get_printer_schema(new_printer)

def update_printer(db: Session, printer_id: str, payload: UpdatePrinterPayload, user_id: str) -> PrinterSchema:
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if payload.name is not None:
        name_trimmed = payload.name.strip()
        if not name_trimmed or len(name_trimmed) > 100:
            raise HTTPException(status_code=422, detail="Printer name must be between 1 and 100 characters.")
        if name_trimmed.lower() != printer.name.lower():
            existing = db.query(Printer).filter(
                Printer.id != printer_id,
                func.lower(Printer.name) == name_trimmed.lower(),
            ).first()
            if existing:
                raise HTTPException(status_code=409, detail=f'A printer named "{name_trimmed}" already exists.')
            printer.name = name_trimmed

    new_ip = validate_ipv4(payload.ip) if payload.ip is not None else printer.ip
    new_port = payload.port if payload.port is not None else printer.port
    if new_port < 1 or new_port > 65535:
        raise HTTPException(status_code=422, detail="Port must be between 1 and 65535.")

    if new_ip != printer.ip or new_port != printer.port:
        existing_addr = db.query(Printer).filter(
            Printer.id != printer_id,
            Printer.ip == new_ip,
            Printer.port == new_port,
        ).first()
        if existing_addr:
            raise HTTPException(
                status_code=409,
                detail=f"A printer with address {new_ip}:{new_port} already exists.",
            )
        printer.ip = new_ip
        printer.port = new_port

    if payload.role is not None:
        if payload.role not in ("kitchen", "cashier"):
            raise HTTPException(status_code=422, detail="Role must be either 'kitchen' or 'cashier'.")
        printer.role = payload.role

    if payload.isActive is not None:
        printer.is_active = payload.isActive

    from app.services import audit
    audit.record(
        session=db,
        event="printer.updated",
        user_id=user_id,
        role="admin",
        entity="printer",
        entity_id=printer.id,
        details={"printerId": printer.id, "name": printer.name, "role": printer.role, "ip": printer.ip, "port": printer.port, "isActive": printer.is_active},
    )

    try:
        db.commit()
        db.refresh(printer)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Printer uniqueness constraint violated.")

    audit_logger.info(f"AUDIT user={user_id} action=update entity=printer ids={printer.id} result=success")
    emit("printer.status", {"printerId": printer.id})
    return get_printer_schema(printer)

def remove_printer(db: Session, printer_id: str, user_id: str) -> Dict[str, Any]:
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    used_categories = db.query(Category).filter(
        Category.printer_id == printer_id,
        Category.is_deleted == False,
        Category.is_active == True,
    ).all()
    if used_categories:
        cat_names = ", ".join(c.name for c in used_categories)
        raise HTTPException(
            status_code=409,
            detail=f'Cannot delete printer "{printer.name}": it is assigned to {len(used_categories)} active category(ies) ({cat_names}). Reassign these categories before deleting.',
        )

    db.query(PrintJob).filter(PrintJob.printer_id == printer_id).delete(synchronize_session=False)

    from app.services import audit
    audit.record(
        session=db,
        event="printer.deleted",
        user_id=user_id,
        role="admin",
        entity="printer",
        entity_id=printer_id,
        details={"printerId": printer_id, "name": printer.name},
    )

    db.delete(printer)
    db.commit()

    audit_logger.info(f"AUDIT user={user_id} action=delete entity=printer ids={printer_id} result=success")
    emit("printer.status", {"printerId": printer_id})
    return {
        "success": True,
        "softDeleted": False,
        "message": f'Printer "{printer.name}" deleted.',
    }

def test_print_printer(db: Session, printer_id: str, user_id: str) -> TestPrintResult:
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    res = execute_test_print(printer, db)

    if res["status"] != "ok":
        emit("printer.status", {"printerId": printer_id, "state": "offline", "message": res["message"]})

    audit_logger.info(
        f"AUDIT user={user_id} action=test_print entity=printer ids={printer_id} result={res['status']}"
    )
    return TestPrintResult(
        status=res["status"],
        message=res["message"],
    )

