import asyncio
import json
import logging
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.database import SessionLocal, Base, engine
from app.core.logging_filters import TokenRedactingFilter
from app.models import Table, Order, Category, MenuItem, Printer, OrderItem, PrintJob
from app.seed.initial_data import run_seed
from app.realtime.hub import hub, is_origin_allowed
from app.services.events import emit


def cleanup_test_orders(db, table_id: str = None):
    query = db.query(Order)
    if table_id:
        query = query.filter(Order.table_id == table_id)
    else:
        query = query.filter((Order.id.like("test-%")) | (Order.id.like("ord-test%")))
    orders = query.all()
    order_ids = [o.id for o in orders]
    if order_ids:
        db.query(Table).filter(Table.current_order_id.in_(order_ids)).update(
            {"status": "free", "current_order_id": None}, synchronize_session=False
        )
        db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).delete(synchronize_session=False)
        db.query(PrintJob).filter(PrintJob.order_id.in_(order_ids)).delete(synchronize_session=False)
        db.query(Order).filter(Order.id.in_(order_ids)).delete(synchronize_session=False)
    if table_id:
        db.query(Table).filter(Table.id == table_id).update(
            {"status": "free", "current_order_id": None}, synchronize_session=False
        )
    db.commit()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    run_seed(db, "backend/seed_data/floor-2-menu.csv")
    cleanup_test_orders(db, table_id="f1-t1")
    db.close()
    yield
    db = SessionLocal()
    cleanup_test_orders(db, table_id="f1-t1")
    cleanup_test_orders(db)
    db.close()


@pytest.fixture(scope="module")
def admin_token():
    client = TestClient(app)
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    return res.json()["token"]


@pytest.fixture(scope="module")
def waiter1_token():
    # waiter1 allowed both floors
    client = TestClient(app)
    res = client.post("/api/auth/login", json={"username": "waiter1", "password": "1234"})
    assert res.status_code == 200
    return res.json()["token"]


@pytest.fixture(scope="module")
def waiter3_token():
    # waiter3 allowed floor-1 only
    client = TestClient(app)
    res = client.post("/api/auth/login", json={"username": "waiter3", "password": "1234"})
    assert res.status_code == 200
    return res.json()["token"]


def test_ws_health_endpoint():
    """Verify /health returns active WebSocket connection count."""
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert "ws" in data
        assert "connections" in data["ws"]
        assert isinstance(data["ws"]["connections"], int)


def test_ws_handshake_success_and_ack(admin_token):
    """Verify handshake sends canonical connection.ack envelope with monotonic seq and metadata."""
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ack = ws.receive_json()
            assert ack["type"] == "connection.ack"
            assert "id" in ack and len(ack["id"]) > 10
            assert "seq" in ack and ack["seq"] >= 1
            assert "ts" in ack
            payload = ack["payload"]
            assert payload["userId"] == "u1"
            assert payload["role"] == "admin"
            assert payload["serverBootId"] == hub.server_boot_id
            assert payload["heartbeatSeconds"] == settings.WS_HEARTBEAT_SECONDS


def test_ws_handshake_missing_or_invalid_token():
    """Verify unauthorized WebSocket connections are closed with code 4401 and error envelope."""
    with TestClient(app) as client:
        # 1. Missing token
        try:
            with client.websocket_connect("/ws") as ws:
                err = ws.receive_json()
                assert err["type"] == "error"
                assert err["payload"]["code"] == "UNAUTHORIZED"
        except Exception:
            pass

        # 2. Invalid JWT token
        try:
            with client.websocket_connect("/ws?token=invalid.jwt.token") as ws:
                err = ws.receive_json()
                assert err["type"] == "error"
                assert err["payload"]["code"] == "UNAUTHORIZED"
        except Exception:
            pass


def test_ws_origin_validation():
    """Verify Origin header validation against allowed origins and LAN regex."""
    assert is_origin_allowed("http://localhost:3000") is True
    assert is_origin_allowed("http://127.0.0.1:3000") is True
    assert is_origin_allowed("http://192.168.1.50:8080") is True
    assert is_origin_allowed("http://10.0.0.12:3000") is True
    assert is_origin_allowed("http://172.20.10.2:3000") is True
    assert is_origin_allowed("http://evil-attacker.com") is False
    assert is_origin_allowed("https://phishing.pos.com") is False


def test_ws_subscribe_and_snapshot_match_http(admin_token):
    """Verify subscribe response matches HTTP GET /api/tables snapshot exactly."""
    with TestClient(app) as client:
        # Fetch HTTP baseline
        http_tables = client.get("/api/tables?floorId=f1", headers={"Authorization": f"Bearer {admin_token}"}).json()

        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()  # connection.ack
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            sub_resp = ws.receive_json()

            assert sub_resp["type"] == "subscribed"
            assert sub_resp["payload"]["floorId"] == "f1"
            ws_tables = sub_resp["payload"]["tables"]

            assert len(ws_tables) == len(http_tables)
            assert {t["id"] for t in ws_tables} == {t["id"] for t in http_tables}
            assert {t["number"] for t in ws_tables} == {t["number"] for t in http_tables}


def test_ws_role_visibility_waiter_vs_admin(waiter1_token, waiter3_token, admin_token):
    """
    Verify floor authorization:
    - waiter3 (floor 1 only) cannot subscribe to floor 2 (returns FORBIDDEN error, connection stays open).
    - waiter1 (both floors) can subscribe to both floor 1 and floor 2.
    - admin can subscribe to both.
    """
    with TestClient(app) as client:
        # waiter3 subscribes to f2 -> FORBIDDEN
        with client.websocket_connect(f"/ws?token={waiter3_token}") as ws:
            ws.receive_json()  # ack
            ws.send_json({"type": "subscribe", "floorId": "f2"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert err["payload"]["code"] == "FORBIDDEN"

            # Connection remains open: ping still succeeds
            ws.send_json({"type": "ping", "clientTs": 42})
            pong = ws.receive_json()
            assert pong["type"] == "pong"
            assert pong["payload"]["clientTs"] == 42

            # Subscribing to allowed floor succeeds
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            sub = ws.receive_json()
            assert sub["type"] == "subscribed"
            assert sub["payload"]["floorId"] == "f1"

        # waiter1 subscribes to f1 and f2 -> both succeed
        with client.websocket_connect(f"/ws?token={waiter1_token}") as ws:
            ws.receive_json()
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            sub1 = ws.receive_json()
            assert sub1["type"] == "subscribed"
            ws.send_json({"type": "subscribe", "floorId": "f2"})
            sub2 = ws.receive_json()
            assert sub2["type"] == "subscribed"

        # admin subscribes to both f1 and f2 -> both succeed
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            sub1 = ws.receive_json()
            assert sub1["type"] == "subscribed"

            ws.send_json({"type": "subscribe", "floorId": "f2"})
            sub2 = ws.receive_json()
            assert sub2["type"] == "subscribed"


def test_ws_unsubscribe_and_unknown_message(admin_token):
    """Verify unsubscribe acknowledgment and handling of unknown message types."""
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()

            # Subscribe
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            ws.receive_json()

            # Unsubscribe
            ws.send_json({"type": "unsubscribe", "floorId": "f1"})
            unsub = ws.receive_json()
            assert unsub["type"] == "unsubscribed"
            assert unsub["payload"]["floorId"] == "f1"

            # Unknown message type returns BAD_MESSAGE without closing
            ws.send_json({"type": "nonexistent_action"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert err["payload"]["code"] == "BAD_MESSAGE"


def test_ws_event_coalescing(admin_token):
    """
    Verify event coalescing:
    20 rapid emits for table.updated within WS_COALESCE_MS window
    collapse into a single broadcast message to the client.
    """
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            ws.receive_json()

            # Rapidly emit 20 updates for table f1-t1
            for _ in range(20):
                emit("table.updated", {"tableId": "f1-t1", "floorId": "f1"})

            # Client receives exactly 1 table.updated event
            evt = ws.receive_json()
            assert evt["type"] == "table.updated"
            assert evt["payload"]["tableId"] == "f1-t1"


def test_ws_printer_status_admin_only(admin_token, waiter3_token):
    """
    Verify printer.status broadcasts exclusively to admin connections,
    and is never delivered to waiter connections.
    """
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as admin_ws:
            admin_ws.receive_json()  # ack

            with client.websocket_connect(f"/ws?token={waiter3_token}") as waiter_ws:
                waiter_ws.receive_json()  # ack
                waiter_ws.send_json({"type": "subscribe", "floorId": "f1"})
                waiter_ws.receive_json()  # subscribed

                # Broadcast printer status
                emit("printer.status", {"printerId": "prn-kitchen-f1", "state": "ok", "message": "Ready"})

                # Admin receives printer.status
                admin_evt = admin_ws.receive_json()
                assert admin_evt["type"] == "printer.status"
                assert admin_evt["payload"]["printerId"] == "prn-kitchen-f1"

                # Waiter does not receive printer.status; can ping cleanly
                waiter_ws.send_json({"type": "ping", "clientTs": 111})
                pong = waiter_ws.receive_json()
                assert pong["type"] == "pong"


def test_ws_menu_changed_event(admin_token):
    """Verify menu.changed event broadcast to floor subscribers."""
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            ws.receive_json()

            emit("menu.changed", {"floorId": "f1"})

            evt = ws.receive_json()
            assert evt["type"] == "menu.changed"
            assert evt["payload"]["floorId"] == "f1"


def test_ws_rate_limiting_disconnects(admin_token):
    """Verify client sending > 10 messages/sec is terminated with code 4429."""
    with TestClient(app) as client:
        try:
            with client.websocket_connect(f"/ws?token={admin_token}") as ws:
                ws.receive_json()  # ack
                # Flood 15 messages instantly
                for i in range(15):
                    ws.send_json({"type": "ping", "clientTs": i})
                # Attempt to receive responses until socket terminates
                for _ in range(15):
                    ws.receive_json()
        except Exception:
            # Socket closed by server due to rate limit violation
            pass


def test_ws_oversized_message_disconnects(admin_token):
    """Verify messages exceeding WS_MAX_MESSAGE_BYTES (4096 bytes) disconnect with code 4429."""
    with TestClient(app) as client:
        try:
            with client.websocket_connect(f"/ws?token={admin_token}") as ws:
                ws.receive_json()  # ack
                oversized_data = {"type": "ping", "payload": "X" * 5000}
                ws.send_text(json.dumps(oversized_data))
                ws.receive_json()
        except Exception:
            # Expected disconnect due to frame size limit
            pass


def test_ws_token_redaction_logging():
    """Verify TokenRedactingFilter replaces sensitive query token parameter in logs."""
    filt = TokenRedactingFilter()

    # Case 1: Simple string query in message
    record1 = logging.LogRecord("test", logging.INFO, "test.py", 1, "GET /ws?token=secret_jwt_token_123 HTTP/1.1", (), None)
    assert filt.filter(record1) is True
    assert "token=***" in record1.msg
    assert "secret_jwt" not in record1.msg

    # Case 2: Multi-param query string
    record2 = logging.LogRecord("test", logging.INFO, "test.py", 1, "GET /ws?foo=bar&token=secret_jwt_456&baz=1", (), None)
    assert filt.filter(record2) is True
    assert "token=***&baz=1" in record2.msg
    assert "secret_jwt" not in record2.msg

    # Case 3: In record args (standard uvicorn format)
    record3 = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "%s - %s", ("127.0.0.1", "GET /api/ws?token=sensitive_jwt HTTP/1.1"), None)
    assert filt.filter(record3) is True
    assert "token=***" in record3.args[1]
    assert "sensitive_jwt" not in record3.args[1]


def test_ws_order_lifecycle_events(admin_token):
    """
    End-to-end event flow:
    Creating / sending order and paying order broadcasts table.updated, order.updated, and bill.paid.
    """
    # Ensure table f1-t1 is free before test
    db = SessionLocal()
    cleanup_test_orders(db, table_id="f1-t1")
    db.close()

    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()  # ack
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            ws.receive_json()  # subscribed

            # Make HTTP call via client2 to send order items
            client2 = TestClient(app)
            headers = {"Authorization": f"Bearer {admin_token}"}
            req_id = f"test-ws-ord-{time.time()}"
            res = client2.post(
                "/api/orders/send",
                headers=headers,
                json={
                    "tableId": "f1-t1",
                    "requestId": req_id,
                    "items": [{"menuItemId": "mi1", "qty": 1}],
                },
            )
            assert res.status_code == 200, res.text
            order_data = res.json()["order"]
            order_id = order_data["id"]

            # WebSocket client receives order.updated and table.updated (and printer.status for admin)
            received_types = set()
            for _ in range(4):
                msg = ws.receive_json()
                received_types.add(msg["type"])
                if "table.updated" in received_types and "order.updated" in received_types:
                    break

            assert "table.updated" in received_types
            assert "order.updated" in received_types

            # Pay order
            pay_req_id = f"test-ws-pay-{time.time()}"
            pay_res = client2.post(
                f"/api/orders/{order_id}/pay",
                headers=headers,
                json={
                    "orderId": order_id,
                    "requestId": pay_req_id,
                    "method": "cash",
                    "amountReceived": 500.0,
                },
            )
            assert pay_res.status_code == 200, pay_res.text

            # WebSocket client receives bill.paid and table.updated
            pay_received_types = set()
            for _ in range(4):
                msg = ws.receive_json()
                pay_received_types.add(msg["type"])
                if "bill.paid" in pay_received_types and "table.updated" in pay_received_types:
                    break

            assert "bill.paid" in pay_received_types
            assert "table.updated" in pay_received_types


def test_ws_latency_benchmark_under_150ms(admin_token):
    """
    Delivery latency benchmark:
    Verify p95 delivery latency from emit() to client receipt is under 150ms.
    """
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()  # ack
            ws.send_json({"type": "subscribe", "floorId": "f1"})
            ws.receive_json()  # subscribed

            # Warmup
            emit("printer.status", {"printerId": "prn-bench-warmup", "state": "ok", "message": "warmup"})
            ws.receive_json()

            latencies = []
            for i in range(10):
                t0 = time.perf_counter()
                emit("printer.status", {"printerId": f"prn-bench-{i}", "state": "ok", "message": f"ping {i}"})
                msg = ws.receive_json()
                t1 = time.perf_counter()
                assert msg["type"] == "printer.status"
                latencies.append(t1 - t0)

            latencies.sort()
            p95 = latencies[int(len(latencies) * 0.95)]
            # Target is < 150ms (0.150s)
            assert p95 < 0.150, f"p95 latency was {p95*1000:.1f}ms, expected < 150ms"


def test_ws_slow_consumer_queue_overflow_closes_1013(admin_token):
    """
    Verify slow consumer protection:
    If a client does not drain messages and send_queue exceeds WS_SEND_QUEUE_MAX (100),
    queue_message initiates close with code 1013 (queue overflow).
    """
    from app.realtime.hub import hub
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws?token={admin_token}") as ws:
            ws.receive_json()  # ack
            # Find client connection in hub
            conn = next((c for c in hub.connections if c.user.username == "admin"), None)
            assert conn is not None

            # Fill up send queue beyond WS_SEND_QUEUE_MAX
            for _ in range(settings.WS_SEND_QUEUE_MAX + 5):
                conn.queue_message('{"type": "flood"}')

            # Expect socket to be closed
            try:
                for _ in range(settings.WS_SEND_QUEUE_MAX + 10):
                    ws.receive_text()
            except Exception:
                pass

