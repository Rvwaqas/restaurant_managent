import logging
import socket
import threading
import time
from typing import Any, Dict, NamedTuple, Optional

from app.core.config import settings
from app.models import Printer
from app.services.printing.health import record_printer_failure, record_printer_success

logger = logging.getLogger("pos.printing.network_driver")

class DriverResult(NamedTuple):
    ok: bool
    error: Optional[str] = None
    message: Optional[str] = None

_printer_locks: Dict[str, threading.Lock] = {}
_locks_meta = threading.Lock()

def _get_printer_lock(printer_id: str) -> threading.Lock:
    with _locks_meta:
        if printer_id not in _printer_locks:
            _printer_locks[printer_id] = threading.Lock()
        return _printer_locks[printer_id]


class NetworkPrinterDriver:
    """
    ESC/POS Network Driver over TCP port 9100.
    Handles per-printer serialization, status checking, and error reporting.
    """

    def send(self, printer: Printer, payload_bytes: bytes) -> DriverResult:
        lock = _get_printer_lock(printer.id)
        with lock:
            result = self._send_internal(printer, payload_bytes)
            # Enforce 100ms gap between consecutive jobs to same printer
            time.sleep(0.1)
            return result

    def _send_internal(self, printer: Printer, payload_bytes: bytes) -> DriverResult:
        ip = printer.ip
        port = printer.port or 9100
        connect_timeout = getattr(settings, "PRINT_CONNECT_TIMEOUT", 2.0)
        send_timeout = getattr(settings, "PRINT_SEND_TIMEOUT", 4.0)
        check_status = getattr(settings, "PRINT_CHECK_STATUS", True)

        try:
            # 1. Establish TCP connection
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            sock.settimeout(connect_timeout)

            try:
                sock.connect((ip, port))
            except socket.timeout:
                msg = f"Printer not reachable ({ip}:{port}): connection timed out after {connect_timeout}s"
                record_printer_failure(printer.id, msg)
                return DriverResult(ok=False, error=msg)
            except ConnectionRefusedError:
                msg = f"Connection refused by printer at {ip}:{port}. Check port 9100 RAW service."
                record_printer_failure(printer.id, msg)
                return DriverResult(ok=False, error=msg)
            except OSError as e:
                msg = f"Network socket error reaching printer ({ip}:{port}): {e}"
                record_printer_failure(printer.id, msg)
                return DriverResult(ok=False, error=msg)

            # 2. Best-effort hardware status query if configured
            if check_status:
                try:
                    sock.settimeout(0.3)  # 300ms query timeout
                    # Query 1: DLE EOT 1 (printer status)
                    sock.sendall(b"\x10\x04\x01")
                    resp1 = sock.recv(1)
                    if resp1 and (resp1[0] & 0x08) != 0:
                        sock.close()
                        msg = f"Printer offline (cover open or error) at {ip}:{port}"
                        record_printer_failure(printer.id, msg)
                        return DriverResult(ok=False, error=msg)

                    # Query 2: DLE EOT 4 (paper roll status)
                    sock.sendall(b"\x10\x04\x04")
                    resp4 = sock.recv(1)
                    if resp4 and (resp4[0] & 0x0C) != 0:
                        sock.close()
                        msg = f"Printer out of paper at {ip}:{port}"
                        record_printer_failure(printer.id, msg)
                        return DriverResult(ok=False, error=msg)

                except (socket.timeout, OSError):
                    # Many POS thermal printers are unidirectional and do not reply.
                    # Per requirements: ignore timeout and continue printing.
                    pass

            # 3. Transmit ESC/POS payload
            sock.settimeout(send_timeout)
            try:
                sock.sendall(payload_bytes)
                # Shutdown write channel and short drain
                try:
                    sock.shutdown(socket.SHUT_WR)
                    sock.settimeout(0.1)
                    try:
                        sock.recv(1024)
                    except (socket.timeout, OSError):
                        pass
                except OSError:
                    pass
            except socket.timeout:
                msg = f"Printer transmission timed out after {send_timeout}s during send"
                record_printer_failure(printer.id, msg)
                return DriverResult(ok=False, error=msg)
            except OSError as e:
                msg = f"Error sending bytes to printer ({ip}:{port}): {e}"
                record_printer_failure(printer.id, msg)
                return DriverResult(ok=False, error=msg)
            finally:
                sock.close()

            # Record success and return
            success_msg = f"Successfully transmitted {len(payload_bytes)} bytes to {printer.name} ({ip}:{port})"
            record_printer_success(printer.id)
            return DriverResult(ok=True, message=success_msg)

        except Exception as e:
            logger.exception("Unexpected exception in NetworkPrinterDriver: %s", e)
            msg = f"Unexpected printer error: {e}"
            record_printer_failure(printer.id, msg)
            return DriverResult(ok=False, error=msg)


def check_printer_hardware_status(ip: str, port: int = 9100) -> Dict[str, Any]:
    """
    Dedicated diagnostic tool for CLI scripts to inspect printer status.
    """
    result = {
        "ip": ip,
        "port": port,
        "online": False,
        "cover_open": False,
        "paper_out": False,
        "raw_status1": None,
        "raw_status4": None,
        "details": "",
    }
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        sock.connect((ip, port))
        sock.settimeout(0.5)

        # DLE EOT 1
        sock.sendall(b"\x10\x04\x01")
        r1 = sock.recv(1)
        if r1:
            result["raw_status1"] = hex(r1[0])
            result["online"] = (r1[0] & 0x08) == 0
            result["cover_open"] = (r1[0] & 0x20) != 0

        # DLE EOT 4
        sock.sendall(b"\x10\x04\x04")
        r4 = sock.recv(1)
        if r4:
            result["raw_status4"] = hex(r4[0])
            result["paper_out"] = (r4[0] & 0x0C) != 0

        sock.close()
        result["details"] = "Queried successfully"
    except Exception as e:
        result["details"] = str(e)

    return result

