from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.endpoints.deps import require_admin
from app.core.database import get_db
from app.schemas import (
    CreatePrinterPayload,
    DeleteResult,
    PrinterSchema,
    TestPrintResult,
    UpdatePrinterPayload,
    User,
)
from app.services.printers import (
    create_printer,
    get_printer_by_id,
    list_printers,
    remove_printer,
    test_print_printer,
    update_printer,
)

router = APIRouter(prefix="/printers", tags=["printers"])

@router.get("", response_model=List[PrinterSchema], response_model_exclude_none=True)
def get_printers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return list_printers(db)

@router.get("/{printer_id}", response_model=PrinterSchema, response_model_exclude_none=True)
def get_single_printer(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return get_printer_by_id(db, printer_id)

@router.post("", response_model=PrinterSchema, status_code=status.HTTP_201_CREATED, response_model_exclude_none=True)
def create_single_printer(
    payload: CreatePrinterPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return create_printer(db, payload, user_id=current_user.id)

@router.put("/{printer_id}", response_model=PrinterSchema, response_model_exclude_none=True)
def update_single_printer(
    printer_id: str,
    payload: UpdatePrinterPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return update_printer(db, printer_id, payload, user_id=current_user.id)

@router.delete("/{printer_id}", response_model=DeleteResult)
def delete_single_printer(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return remove_printer(db, printer_id, user_id=current_user.id)

@router.post("/{printer_id}/test", response_model=TestPrintResult)
def test_printer(
    printer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return test_print_printer(db, printer_id, user_id=current_user.id)

