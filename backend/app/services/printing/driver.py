import uuid
from typing import Any, Dict, Optional, Protocol

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Printer, PrintJob
from app.services.printing.escpos import to_escpos
from app.services.printing.network_driver import DriverResult, NetworkPrinterDriver
from app.services.printing.renderers import render_slip
from app.services.printing.simulate_driver import SimulatePrinterDriver
from app.services.printing.text_preview import to_text


class PrinterDriver(Protocol):
    def send(self, printer: Printer, payload_bytes: bytes, **kwargs) -> DriverResult:
        ...



def get_printer_driver():
    if settings.PRINT_MODE == "network":
        return NetworkPrinterDriver()
    return SimulatePrinterDriver()


def execute_test_print(printer: Printer, db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Executes a test print slip using the standard test slip renderer and the active driver.
    Maintains exact API response contract: {"status": "ok" | "failed", "message": str}.
    """
    driver = get_printer_driver()
    job_id = f"pj-test-{uuid.uuid4().hex[:10]}"

    payload = {
        "v": 1,
        "kind": "test",
        "printerName": printer.name,
        "ip": printer.ip,
        "port": printer.port or 9100,
        "role": printer.role,
        "restaurantName": settings.APP_NAME,
    }

    cols = getattr(settings, "PRINT_COLUMNS", 48)
    doc = render_slip("test", payload, columns=cols)
    escpos_bytes = to_escpos(
        doc,
        print_cut=settings.PRINT_CUT,
        cash_drawer_kick=False,
        columns=cols,
    )
    text_repr = to_text(doc, columns=cols)

    # Call driver
    if isinstance(driver, SimulatePrinterDriver):
        result: DriverResult = driver.send(
            printer, escpos_bytes, job_id=job_id, text_preview=text_repr
        )
    else:
        result: DriverResult = driver.send(printer, escpos_bytes)

    if result.ok:
        status_str = "ok"
        msg = f"Test print slip successfully sent to {printer.name} ({printer.ip}:{printer.port})."
        err_msg = None
    else:
        status_str = "failed"
        err_msg = result.error or "Printer unreachable"
        msg = f"Network timeout: could not reach printer at {printer.ip}:{printer.port}. Check device power and IP assignment."

    if db:
        existing = db.query(Printer).filter(Printer.id == printer.id).first()
        if existing:
            job = PrintJob(
                id=job_id,
                printer_id=printer.id,
                kind="test",
                status=status_str if status_str == "ok" else "failed",
                message=msg,
                error=err_msg,
                printer_name=f"{printer.name} ({printer.ip})",
            )
            db.add(job)
            db.commit()

    return {"status": status_str, "message": msg}
