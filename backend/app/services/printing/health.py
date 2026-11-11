import datetime
import threading
from dataclasses import dataclass
from typing import Dict, Optional

from app.services.events import emit


@dataclass
class PrinterHealth:
    printer_id: str
    state: str = "ok"  # "ok", "degraded", "offline"
    consecutive_failures: int = 0
    last_success_time: Optional[datetime.datetime] = None
    last_failure_time: Optional[datetime.datetime] = None
    last_failure_message: Optional[str] = None

_health_lock = threading.Lock()
_health_store: Dict[str, PrinterHealth] = {}


def get_printer_health(printer_id: str) -> PrinterHealth:
    with _health_lock:
        if printer_id not in _health_store:
            _health_store[printer_id] = PrinterHealth(printer_id=printer_id)
        return _health_store[printer_id]


def record_printer_success(printer_id: str) -> None:
    with _health_lock:
        health = _health_store.setdefault(printer_id, PrinterHealth(printer_id=printer_id))
        old_state = health.state
        health.consecutive_failures = 0
        health.state = "ok"
        health.last_success_time = datetime.datetime.now(datetime.timezone.utc)

        if old_state != "ok":
            emit(
                "printer.status",
                {
                    "printerId": printer_id,
                    "state": "ok",
                    "message": "Printer reconnected and operational",
                },
            )


def record_printer_failure(printer_id: str, error_message: str) -> None:
    with _health_lock:
        health = _health_store.setdefault(printer_id, PrinterHealth(printer_id=printer_id))
        old_state = health.state
        health.consecutive_failures += 1
        health.last_failure_time = datetime.datetime.now(datetime.timezone.utc)
        health.last_failure_message = error_message

        if health.consecutive_failures >= 3:
            new_state = "offline"
        else:
            new_state = "degraded"

        health.state = new_state
        if old_state != new_state:
            emit(
                "printer.status",
                {
                    "printerId": printer_id,
                    "state": new_state,
                    "message": error_message,
                },
            )

