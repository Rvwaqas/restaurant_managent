import os
import sys
import time
import json
import socket
import threading
import datetime
import pytest
from typing import Generator

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings
from app.core.clock import now_utc
from app.core.database import SessionLocal, engine, Base
from app.models import Printer, PrintJob
from app.services.printing.document import (
    SlipDocument,
    sanitize_text,
    format_slip_money,
    format_slip_datetime,
    left_right,
    center,
    wrap_hanging,
)
from app.services.printing.escpos import to_escpos
from app.services.printing.text_preview import to_text
from app.services.printing.renderers import (
    render_slip,
    render_kitchen_slip,
    render_cancel_slip,
    render_bill_slip,
    render_test_slip,
)
from app.services.printing.health import (
    get_printer_health,
    record_printer_success,
    record_printer_failure,
    _health_store,
)
from app.services.printing.network_driver import (
    NetworkPrinterDriver,
    check_printer_hardware_status,
)
from app.services.printing.simulate_driver import SimulatePrinterDriver
from app.services.printing.dispatcher import (
    create_queued_print_job,
    dispatch_print_jobs,
    run_print_queue_recovery,
    cleanup_old_print_jobs,
)


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


# ==============================================================================
# 1. TEXT SANITIZATION & FORMATTING TESTS
# ==============================================================================


def test_sanitize_text():
    # NFKD normalization & non-ASCII replacement
    assert sanitize_text("Café Crème") == "Cafe Creme"
    # Chinese or unsupported scripts replaced with ?
    assert sanitize_text("炒饭") == "??"
    # Strips control characters < 0x20 except \n, plus 0x7F
    assert sanitize_text("Line1\x00\x05\x1bLine2") == "Line1Line2"
    assert sanitize_text("Line1\nLine2\x7f") == "Line1\nLine2"
    # Preserves printable ASCII
    assert sanitize_text("Hello World! 123 @#$%^&*()") == "Hello World! 123 @#$%^&*()"


def test_slip_formatting_helpers():
    assert format_slip_money(1700.0) == "Rs 1,700.00"
    assert format_slip_money(0.0) == "Rs 0.00"
    assert format_slip_money(25.5) == "Rs 25.50"

    # left_right
    lr = left_right("Table: 5", "Batch #1", 32)
    assert len(lr) == 32
    assert lr.startswith("Table: 5")
    assert lr.endswith("Batch #1")

    # center
    c = center("Receipt", 32)
    assert len(c) == 32
    assert "Receipt" in c

    # wrap_hanging
    lines = wrap_hanging("A very long dish name that should wrap across lines", 20, indent=2)
    assert len(lines) >= 2
    assert lines[1].startswith("  ")


# ==============================================================================
# 2. SLIP RENDERER TESTS (32, 42, 48 COLUMNS)
# ==============================================================================


@pytest.mark.parametrize("cols", [32, 42, 48])
def test_render_kitchen_slip(cols):
    payload = {
        "v": 1,
        "kind": "kitchen",
        "orderId": "ord-test-12345",
        "tableNumber": "12",
        "floorName": "Main Floor",
        "waiterName": "Alice",
        "batchNo": 2,
        "categoryName": "Kitchen",
        "printerName": "Kitchen Thermal",
        "items": [
            {"name": "Nasi Lemak Special", "qty": 2, "note": "Extra spicy"},
            {"name": "Teh Tarik Ice", "qty": 1, "note": ""},
        ],
    }

    doc = render_kitchen_slip(payload, columns=cols)
    text = to_text(doc, columns=cols)

    # Validate content
    assert "*** KITCHEN ORDER ***" in text
    assert "TABLE: #12" in text
    assert "BATCH #2" in text
    assert "Alice" in text
    assert "2x   Nasi Lemak Special" in text or "2x  Nasi Lemak Special" in text or "2x" in text
    assert "** NOTE: Extra spicy **" in text
    assert "TOTAL ITEMS:" in text
    assert "--- END OF TICKET ---" in text

    # Validate that no line exceeds column width
    for line in text.split("\n"):
        assert len(line) <= cols


@pytest.mark.parametrize("cols", [32, 42, 48])
def test_render_cancel_slip(cols):
    payload = {
        "v": 1,
        "kind": "cancel",
        "orderId": "ord-test-12345",
        "tableNumber": "12",
        "floorName": "Main Floor",
        "categoryName": "Kitchen",
        "name": "Nasi Lemak Special",
        "qty": 1,
        "reason": "Customer cancelled dish",
        "voidedBy": "Admin Bob",
    }

    doc = render_cancel_slip(payload, columns=cols)
    text = to_text(doc, columns=cols)

    assert "*** ITEM CANCELLED ***" in text
    assert "DO NOT PREPARE" in text
    assert "TABLE: #12" in text
    assert "Admin Bob" in text
    assert "-1x  Nasi Lemak Special" in text
    assert "CUSTOMER CANCELLED DISH" in text

    for line in text.split("\n"):
        assert len(line) <= cols


@pytest.mark.parametrize("cols", [32, 42, 48])
def test_render_bill_slip(cols):
    payload = {
        "v": 1,
        "kind": "bill",
        "billNo": "B-0077",
        "orderId": "ord-test-12345",
        "tableNumber": "12",
        "floorName": "Main Floor",
        "waiterName": "Alice",
        "paymentMethod": "cash",
        "subtotal": 2000.0,
        "discount": 200.0,
        "tax": 0.0,            # Zero tax should be omitted
        "serviceCharge": 0.0,  # Zero service charge should be omitted
        "total": 1800.0,
        "amountReceived": 2000.0,
        "changeDue": 200.0,
        "items": [
            {"name": "Nasi Lemak Special", "qty": 2, "price": 600.0, "total": 1200.0},
            {"name": "Roti Canai with Dhal", "qty": 4, "price": 200.0, "total": 800.0},
        ],
    }

    doc = render_bill_slip(payload, columns=cols)
    text = to_text(doc, columns=cols)

    assert "*** FINAL BILL RECEIPT ***" in text
    assert "BILL NO: B-0077" in text
    assert "METHOD: CASH" in text
    assert "Subtotal:" in text
    assert "Discount:" in text
    assert "GRAND TOTAL:" in text
    assert "Cash Received:" in text
    assert "Change Due:" in text
    # Tax and Service Charge lines must NOT appear when 0.0
    assert "Tax:" not in text
    assert "Service Charge:" not in text

    for line in text.split("\n"):
        assert len(line) <= cols


@pytest.mark.parametrize("cols", [32, 42, 48])
def test_render_test_slip(cols):
    payload = {
        "v": 1,
        "kind": "test",
        "printerName": "Kitchen Printer 1",
        "ip": "192.168.1.101",
        "port": 9100,
        "role": "kitchen",
        "restaurantName": "Soufi Restaurant",
    }

    doc = render_test_slip(payload, columns=cols)
    text = to_text(doc, columns=cols)

    assert "*** PRINTER TEST SLIP ***" in text
    assert "Kitchen Printer 1" in text
    assert "192.168.1.101:9100" in text
    assert f"{cols} cols" in text
    assert "TEST PRINT OK" in text

    # Verify ruler is present and exactly matches column length
    ruler_found = False
    for line in text.split("\n"):
        if line.startswith("1234567890"):
            ruler_found = True
            assert len(line) == cols
        assert len(line) <= cols
    assert ruler_found


# ==============================================================================
# 3. ESC/POS BYTE GENERATION TESTS
# ==============================================================================


def test_escpos_byte_builder():
    doc = SlipDocument(kind="test")
    doc.add_line("Header Line", align="center", bold=True, size="double_both")
    doc.add_separator("-")
    doc.add_line("Normal Line", align="left")
    doc.add_cut(partial=True, feed_lines=3)
    doc.add_drawer_kick()

    raw = to_escpos(doc, print_cut=True, cash_drawer_kick=True, columns=48)

    # Starts with ESC @ (\x1b@)
    assert raw.startswith(b"\x1b@")
    # Contains text
    assert b"Header Line" in raw
    assert b"Normal Line" in raw
    # Contains feed lines (ESC d \x03) and partial cut (GS V 66 0 / \x1dVB\x00)
    assert b"\x1bd\x03" in raw
    assert b"\x1dVB\x00" in raw
    # Contains drawer kick (\x1bp\x00\x19\xfa)
    assert b"\x1bp\x00\x19\xfa" in raw


# ==============================================================================
# 4. MOCK TCP NETWORK PRINTER SERVER TESTS
# ==============================================================================


class FakeThermalPrinterServer:
    def __init__(self, mode="ok"):
        self.mode = mode
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(("127.0.0.1", 0))
        self.port = self.server_socket.getsockname()[1]
        self.server_socket.listen(1)
        self.received_bytes = bytearray()
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        try:
            self.server_socket.settimeout(2.0)
            while self.running:
                try:
                    conn, _ = self.server_socket.accept()
                except socket.timeout:
                    continue

                with conn:
                    conn.settimeout(1.0)
                    while self.running:
                        try:
                            data = conn.recv(1024)
                            if not data:
                                break
                            self.received_bytes.extend(data)

                            if self.mode == "ok":
                                # Handle status queries DLE EOT 1 and DLE EOT 4
                                if b"\x10\x04\x01" in data:
                                    conn.sendall(b"\x12")  # Printer online, cover closed
                                if b"\x10\x04\x04" in data:
                                    conn.sendall(b"\x12")  # Paper present
                            elif self.mode == "paper_out":
                                if b"\x10\x04\x04" in data:
                                    conn.sendall(b"\x1e")  # Paper empty bit set
                            elif self.mode == "unidirectional":
                                # Receives bytes but ignores/drops DLE EOT
                                pass
                        except Exception:
                            break
        except Exception:
            pass

    def stop(self):
        self.running = False
        try:
            self.server_socket.close()
        except Exception:
            pass
        self.thread.join(timeout=1.0)


def test_network_driver_successful_send():
    server = FakeThermalPrinterServer(mode="ok")
    try:
        printer = Printer(
            id="prn-test-net",
            name="Network Kitchen",
            ip="127.0.0.1",
            port=server.port,
            is_active=True,
            role="kitchen",
        )
        driver = NetworkPrinterDriver()
        payload = b"\x1b@Hello Network Printer\n\x1dV\x42\x00"

        res = driver.send(printer, payload)
        assert res.ok is True
        assert b"Hello Network Printer" in server.received_bytes
    finally:
        server.stop()


def test_network_driver_unidirectional_printer():
    # Many cheap printers accept raw bytes but do not reply to status queries
    server = FakeThermalPrinterServer(mode="unidirectional")
    try:
        printer = Printer(
            id="prn-test-unidir",
            name="Unidirectional Kitchen",
            ip="127.0.0.1",
            port=server.port,
            is_active=True,
            role="kitchen",
        )
        driver = NetworkPrinterDriver()
        payload = b"\x1b@Print Despite No Status\n\x1dV\x42\x00"

        # Best effort status check should NOT fail the print job
        res = driver.send(printer, payload)
        assert res.ok is True
        assert b"Print Despite No Status" in server.received_bytes
    finally:
        server.stop()


def test_network_driver_connection_refused():
    # Target an unused local port
    printer = Printer(
        id="prn-test-refused",
        name="Offline Printer",
        ip="127.0.0.1",
        port=65432,
        is_active=True,
        role="kitchen",
    )
    driver = NetworkPrinterDriver()
    res = driver.send(printer, b"Test payload")
    assert res.ok is False
    assert "refused" in res.error.lower() or "not reachable" in res.error.lower()


def test_printer_hardware_status_check():
    server = FakeThermalPrinterServer(mode="ok")
    try:
        hw = check_printer_hardware_status("127.0.0.1", server.port)
        assert hw["online"] is True
        assert hw["cover_open"] is False
        assert hw["paper_out"] is False
    finally:
        server.stop()


# ==============================================================================
# 5. PRINTER HEALTH TRACKING TESTS
# ==============================================================================


def test_printer_health_tracking():
    pid = "prn-health-test"
    _health_store.pop(pid, None)

    # Initial state
    h = get_printer_health(pid)
    assert h.state == "ok"
    assert h.consecutive_failures == 0

    # Record 1 failure -> degraded
    record_printer_failure(pid, "Timeout 1")
    h = get_printer_health(pid)
    assert h.state == "degraded"
    assert h.consecutive_failures == 1

    # Record 2 failures -> degraded
    record_printer_failure(pid, "Timeout 2")
    h = get_printer_health(pid)
    assert h.state == "degraded"
    assert h.consecutive_failures == 2

    # Record 3 failures -> offline
    record_printer_failure(pid, "Timeout 3")
    h = get_printer_health(pid)
    assert h.state == "offline"
    assert h.consecutive_failures == 3

    # Success restores to ok
    record_printer_success(pid)
    h = get_printer_health(pid)
    assert h.state == "ok"
    assert h.consecutive_failures == 0


# ==============================================================================
# 6. DISPATCHER QUEUE, RECOVERY & RETENTION TESTS
# ==============================================================================


def test_dispatcher_execution_and_retention(db):
    # Setup isolated test printer
    import uuid
    printer_id = f"prn-disp-{uuid.uuid4().hex[:8]}"
    printer = Printer(
        id=printer_id,
        name="Test Kitchen Disp",
        ip=f"192.168.200.{int(time.time()) % 200 + 10}",
        port=9100,
        is_active=True,
        role="kitchen",
    )
    db.add(printer)
    db.commit()

    try:
        # Create queued job
        snapshot = {
            "v": 1,
            "kind": "kitchen",
            "orderId": "ord-disp-1",
            "tableNumber": "7",
            "batchNo": 1,
            "items": [{"name": "Roti Canai", "qty": 2}],
        }
        pj = create_queued_print_job(
            db=db,
            kind="kitchen",
            printer_id=printer_id,
            order_id="ord-disp-1",
            payload_snapshot=snapshot,
        )
        db.commit()

        # In simulate mode, dispatch should succeed
        results = dispatch_print_jobs([pj.id], db)
        assert len(results) == 1
        assert results[0].status == "printed"

        # Verify database was updated
        updated_pj = db.query(PrintJob).filter(PrintJob.id == pj.id).first()
        assert updated_pj.status == "printed"
        assert updated_pj.attempts == 1
        assert updated_pj.printed_at is not None

        # Test startup recovery
        # Clear any residual queued jobs first to ensure deterministic counts
        db.query(PrintJob).filter(PrintJob.status == "queued").delete()
        db.commit()

        # 1. Job < 10 mins ago
        recent_pj = create_queued_print_job(
            db=db,
            kind="kitchen",
            printer_id=printer_id,
            order_id="ord-disp-2",
            payload_snapshot=snapshot,
        )
        recent_pj.created_at = now_utc() - datetime.timedelta(minutes=2)

        # 2. Job > 10 mins ago (should expire)
        old_pj = create_queued_print_job(
            db=db,
            kind="kitchen",
            printer_id=printer_id,
            order_id="ord-disp-3",
            payload_snapshot=snapshot,
        )
        old_pj.created_at = now_utc() - datetime.timedelta(minutes=15)
        db.commit()

        recovery_res = run_print_queue_recovery(db)
        assert recovery_res["recovered"] == 1
        assert recovery_res["expired"] == 1

        db.refresh(old_pj)
        assert old_pj.status == "failed"
        assert "Expired" in old_pj.error

        # Test retention cleanup (60 days)
        ancient_pj = create_queued_print_job(
            db=db,
            kind="kitchen",
            printer_id=printer_id,
            order_id="ord-ancient",
            payload_snapshot=snapshot,
        )
        ancient_id = ancient_pj.id
        ancient_pj.created_at = now_utc() - datetime.timedelta(days=70)
        db.commit()

        deleted = cleanup_old_print_jobs(db, retention_days=60)
        assert deleted >= 1
        assert db.query(PrintJob).filter(PrintJob.id == ancient_id).first() is None
    finally:
        db.query(PrintJob).filter(PrintJob.printer_id == printer_id).delete(synchronize_session=False)
        db.query(Printer).filter(Printer.id == printer_id).delete(synchronize_session=False)
        db.commit()
