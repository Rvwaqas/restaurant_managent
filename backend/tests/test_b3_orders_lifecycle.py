import datetime
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.database import SessionLocal
from app.models import Table, Order, OrderItem, MenuItem, Category, Printer, DailySequence
from app.core.clock import set_clock, reset_clock
from app.services.table_consistency import run_table_consistency_check

client = TestClient(app)

def get_auth_token(username="admin", password="admin123"):
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["token"]

@pytest.fixture(autouse=True)
def cleanup_after_test():
    yield
    reset_clock()
    db = SessionLocal()
    try:
        # Clean up any test orders or test tables
        test_orders = db.query(Order).filter(Order.table_id.like("test-%")).all()
        for o in test_orders:
            db.delete(o)
        test_tables = db.query(Table).filter(Table.id.like("test-%")).all()
        for t in test_tables:
            db.delete(t)
        db.commit()
    finally:
        db.close()


def test_send_items_new_order_and_batches():
    admin_token = get_auth_token("admin", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Find an active table and an active dish on floor-1
    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free", Table.is_active == True).first()
    assert table is not None
    table_id = table.id

    menu_item1 = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
    menu_item2 = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True, MenuItem.id != menu_item1.id).first()
    db.close()

    # 1. Send first batch
    req_id_1 = f"req-batch-1-{datetime.datetime.utcnow().timestamp()}"
    res = client.post(
        "/api/orders/send",
        headers=headers,
        json={
            "tableId": table_id,
            "requestId": req_id_1,
            "items": [
                {"menuItemId": menu_item1.id, "qty": 2, "note": "Less spicy"}
            ]
        }
    )
    assert res.status_code == 200, res.text
    data1 = res.json()
    assert data1["batchNo"] == 1
    assert data1["order"]["status"] == "open"
    assert len(data1["order"]["items"]) == 1
    assert data1["order"]["items"][0]["qty"] == 2
    assert data1["order"]["items"][0]["note"] == "Less spicy"
    assert len(data1["printJobs"]) >= 1
    order_id = data1["order"]["id"]

    # Verify table state
    res_table = client.get(f"/api/tables/{table_id}", headers=headers)
    assert res_table.status_code == 200
    assert res_table.json()["status"] == "occupied"
    assert res_table.json()["currentOrderId"] == order_id

    # 2. Send second batch to same table
    req_id_2 = f"req-batch-2-{datetime.datetime.utcnow().timestamp()}"
    res2 = client.post(
        "/api/orders/send",
        headers=headers,
        json={
            "tableId": table_id,
            "requestId": req_id_2,
            "items": [
                {"menuItemId": menu_item2.id, "qty": 1, "note": "Extra sauce"}
            ]
        }
    )
    assert res2.status_code == 200, res2.text
    data2 = res2.json()
    assert data2["batchNo"] == 2
    assert data2["order"]["id"] == order_id
    assert len(data2["order"]["items"]) == 2

    # Clean up order
    client.post(f"/api/orders/{order_id}/cancel", headers=headers)


def test_send_items_validations_and_floor_guards():
    admin_token = get_auth_token("admin", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    db = SessionLocal()
    f1_table = db.query(Table).filter(Table.floor_id == "f1", Table.is_active == True).first()
    f2_item = db.query(MenuItem).filter(MenuItem.floor_id == "f2", MenuItem.available == True).first()
    f1_item = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()

    f1_table_id = f1_table.id
    f2_item_id = f2_item.id
    f1_item_id = f1_item.id

    # Create temporarily unavailable item
    unavail_item = db.query(MenuItem).filter(MenuItem.floor_id == "f1").all()[-1]
    unavail_name = unavail_item.name
    unavail_id = unavail_item.id
    unavail_item.available = False
    db.commit()
    db.close()

    try:
        # Cross floor item validation
        res_cross = client.post(
            "/api/orders/send",
            headers=headers,
            json={
                "tableId": f1_table_id,
                "requestId": "req-cross",
                "items": [{"menuItemId": f2_item_id, "qty": 1}]
            }
        )
        assert res_cross.status_code == 422
        assert "is not on floor" in res_cross.json()["message"]

        # Unavailable item validation (exact message)
        res_unavail = client.post(
            "/api/orders/send",
            headers=headers,
            json={
                "tableId": f1_table_id,
                "requestId": "req-unavail",
                "items": [{"menuItemId": unavail_id, "qty": 1}]
            }
        )
        assert res_unavail.status_code == 422
        assert f"{unavail_name} is currently marked unavailable" in res_unavail.json()["message"]

        # Note too long (>200 chars)
        res_long_note = client.post(
            "/api/orders/send",
            headers=headers,
            json={
                "tableId": f1_table_id,
                "requestId": "req-long",
                "items": [{"menuItemId": f1_item_id, "qty": 1, "note": "x" * 201}]
            }
        )
        assert res_long_note.status_code == 422

        # Qty out of bounds (<1 or >99)
        res_qty = client.post(
            "/api/orders/send",
            headers=headers,
            json={
                "tableId": f1_table_id,
                "requestId": "req-qty",
                "items": [{"menuItemId": f1_item_id, "qty": 0}]
            }
        )
        assert res_qty.status_code == 422

    finally:
        db = SessionLocal()
        item = db.query(MenuItem).filter(MenuItem.id == unavail_id).first()
        if item:
            item.available = True
            db.commit()
        db.close()


def test_idempotency_send_and_conflict():
    admin_token = get_auth_token("admin", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free", Table.is_active == True).first()
    item = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
    table_id = table.id
    item_id = item.id
    db.close()

    req_id = f"idemp-test-{datetime.datetime.utcnow().timestamp()}"

    # First attempt
    res1 = client.post(
        "/api/orders/send",
        headers=headers,
        json={"tableId": table_id, "requestId": req_id, "items": [{"menuItemId": item_id, "qty": 1}]}
    )
    assert res1.status_code == 200
    order_id = res1.json()["order"]["id"]

    # Replay with same body
    res2 = client.post(
        "/api/orders/send",
        headers=headers,
        json={"tableId": table_id, "requestId": req_id, "items": [{"menuItemId": item_id, "qty": 1}]}
    )
    assert res2.status_code == 200
    assert res2.json()["order"]["id"] == order_id
    assert len(res2.json()["order"]["items"]) == 1  # No duplicate added!

    # Replay with different body (conflict)
    res3 = client.post(
        "/api/orders/send",
        headers=headers,
        json={"tableId": table_id, "requestId": req_id, "items": [{"menuItemId": item_id, "qty": 5}]}
    )
    assert res3.status_code == 409
    assert "requestId was already used with a different request" in res3.json()["message"]

    # Clean up
    client.post(f"/api/orders/{order_id}/cancel", headers=headers)


def test_void_item_admin_guard_and_totals():
    admin_token = get_auth_token("admin", "admin123")
    waiter_token = get_auth_token("waiter1", "1234")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    waiter_headers = {"Authorization": f"Bearer {waiter_token}"}

    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free", Table.is_active == True).first()
    items = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).limit(2).all()
    t_id = table.id
    i1_id = items[0].id
    i2_id = items[1].id
    p1 = items[0].price
    p2 = items[1].price
    db.close()

    # Send 2 items
    res_send = client.post(
        "/api/orders/send",
        headers=admin_headers,
        json={
            "tableId": t_id,
            "requestId": f"req-void-{datetime.datetime.utcnow().timestamp()}",
            "items": [
                {"menuItemId": i1_id, "qty": 1},
                {"menuItemId": i2_id, "qty": 1},
            ]
        }
    )
    assert res_send.status_code == 200
    order_data = res_send.json()["order"]
    order_id = order_data["id"]
    item_to_void = order_data["items"][0]

    # 1. Waiter unauthorized void attempt -> 403
    res_unauth = client.post(
        f"/api/orders/{order_id}/void-item",
        headers=waiter_headers,
        json={
            "orderId": order_id,
            "orderItemId": item_to_void["id"],
            "reason": "Customer changed mind",
            "requestId": f"void-req-unauth-{datetime.datetime.utcnow().timestamp()}",
        }
    )
    assert res_unauth.status_code == 403
    assert "Admin access required" in res_unauth.json()["message"]

    # 2. Admin voids item successfully
    res_void = client.post(
        f"/api/orders/{order_id}/void-item",
        headers=admin_headers,
        json={
            "orderId": order_id,
            "orderItemId": item_to_void["id"],
            "reason": "Customer changed mind",
            "requestId": f"void-req-auth-{datetime.datetime.utcnow().timestamp()}",
        }
    )
    assert res_void.status_code == 200, res_void.text
    void_data = res_void.json()
    assert void_data["voidedItem"]["voided"] is True
    assert void_data["voidedItem"]["voidReason"] == "Customer changed mind"
    assert void_data["order"]["total"] == pytest.approx(p2, 0.01)

    # 3. Double void -> 400
    res_double = client.post(
        f"/api/orders/{order_id}/void-item",
        headers=admin_headers,
        json={
            "orderId": order_id,
            "orderItemId": item_to_void["id"],
            "reason": "Customer changed mind again",
            "requestId": f"void-req-auth-2-{datetime.datetime.utcnow().timestamp()}",
        }
    )
    assert res_double.status_code == 400
    assert "already cancelled" in res_double.json()["message"]

    # Clean up
    client.post(f"/api/orders/{order_id}/cancel", headers=admin_headers)


def test_pay_order_cash_and_discount():
    admin_token = get_auth_token("admin", "admin123")
    waiter_token = get_auth_token("waiter1", "1234")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    waiter_headers = {"Authorization": f"Bearer {waiter_token}"}

    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free", Table.is_active == True).first()
    dish = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
    t_id = table.id
    dish_id = dish.id
    price = dish.price
    db.close()

    # Create order with 1 item
    res_send = client.post(
        "/api/orders/send",
        headers=admin_headers,
        json={
            "tableId": t_id,
            "requestId": f"req-pay-{datetime.datetime.utcnow().timestamp()}",
            "items": [{"menuItemId": dish_id, "qty": 2}]
        }
    )
    assert res_send.status_code == 200
    order_id = res_send.json()["order"]["id"]
    expected_total = price * 2

    # 1. Waiter cannot apply discount -> 403
    res_disc_waiter = client.post(
        f"/api/orders/{order_id}/pay",
        headers=waiter_headers,
        json={
            "orderId": order_id,
            "requestId": "pay-disc-waiter",
            "method": "cash",
            "discountType": "percent",
            "discountValue": 10,
            "amountReceived": 5000,
        }
    )
    assert res_disc_waiter.status_code == 403
    assert "Only admin can apply discount" in res_disc_waiter.json()["message"]

    # 2. Cash underpayment -> 422
    res_underpay = client.post(
        f"/api/orders/{order_id}/pay",
        headers=admin_headers,
        json={
            "orderId": order_id,
            "requestId": "pay-underpay",
            "method": "cash",
            "amountReceived": expected_total - 1,
        }
    )
    assert res_underpay.status_code == 422
    assert "Amount received must be at least" in res_underpay.json()["message"]

    # 3. Successful cash payment with change
    amount_received = expected_total + 100
    res_pay = client.post(
        f"/api/orders/{order_id}/pay",
        headers=admin_headers,
        json={
            "orderId": order_id,
            "requestId": f"pay-success-{datetime.datetime.utcnow().timestamp()}",
            "method": "cash",
            "amountReceived": amount_received,
        }
    )
    assert res_pay.status_code == 200, res_pay.text
    pay_data = res_pay.json()
    assert pay_data["order"]["status"] == "paid"
    assert pay_data["order"]["billNo"].startswith("B-")
    assert pay_data["order"]["changeDue"] == 100.0
    assert pay_data["table"]["status"] == "free"
    assert pay_data["billPrintJob"]["printerId"] is not None

    # Verify table freed in database
    res_t = client.get(f"/api/tables/{t_id}", headers=admin_headers)
    assert res_t.json()["status"] == "free"
    assert res_t.json().get("currentOrderId") is None

    # 4. Cannot pay already paid order -> 409
    res_repeat = client.post(
        f"/api/orders/{order_id}/pay",
        headers=admin_headers,
        json={
            "orderId": order_id,
            "requestId": f"pay-repeat-{datetime.datetime.utcnow().timestamp()}",
            "method": "cash",
            "amountReceived": 5000,
        }
    )
    assert res_repeat.status_code == 409
    assert "already paid" in res_repeat.json()["message"]


def test_daily_sequence_reset_at_business_day_start():
    # Clean up test dates in daily_sequences
    from sqlalchemy import text
    db_clean = SessionLocal()
    db_clean.execute(text("DELETE FROM daily_sequences WHERE business_date IN ('2026-11-10', '2026-11-11')"))
    db_clean.commit()
    db_clean.close()

    # Set clock to 14:00 today
    day1_dt = datetime.datetime(2026, 11, 10, 14, 0, 0)
    set_clock(day1_dt)

    admin_token = get_auth_token("admin", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free", Table.is_active == True).first()
    dish = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
    t_id = table.id
    dish_id = dish.id
    db.close()

    import uuid
    # Pay order 1 on day 1
    s1 = client.post(
        "/api/orders/send",
        headers=headers,
        json={"tableId": t_id, "requestId": f"s1-{uuid.uuid4().hex}", "items": [{"menuItemId": dish_id, "qty": 1}]}
    )
    assert s1.status_code == 200, s1.text
    o1_id = s1.json()["order"]["id"]
    p1 = client.post(
        f"/api/orders/{o1_id}/pay",
        headers=headers,
        json={"orderId": o1_id, "requestId": f"p1-{uuid.uuid4().hex}", "method": "card"}
    )
    assert p1.status_code == 200, p1.text
    bill1 = p1.json()["order"]["billNo"]

    # Advance clock to next business day at 06:00 (past 05:00 cutoff)
    day2_dt = datetime.datetime(2026, 11, 11, 6, 0, 0)
    set_clock(day2_dt)

    s2 = client.post(
        "/api/orders/send",
        headers=headers,
        json={"tableId": t_id, "requestId": f"s2-{uuid.uuid4().hex}", "items": [{"menuItemId": dish_id, "qty": 1}]}
    )
    assert s2.status_code == 200, s2.text
    o2_id = s2.json()["order"]["id"]
    p2 = client.post(
        f"/api/orders/{o2_id}/pay",
        headers=headers,
        json={"orderId": o2_id, "requestId": f"p2-{uuid.uuid4().hex}", "method": "card"}
    )
    assert p2.status_code == 200, p2.text
    bill2 = p2.json()["order"]["billNo"]

    # Since day changed, sequence resets to B-0001
    assert bill2 == "B-0001"


def test_reprint_kitchen_and_bill():
    admin_token = get_auth_token("admin", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free", Table.is_active == True).first()
    dish = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
    t_id = table.id
    dish_id = dish.id
    cat_id = dish.category_id
    db.close()

    # Send order
    s = client.post(
        "/api/orders/send",
        headers=headers,
        json={"tableId": t_id, "requestId": f"req-rep-{uuid.uuid4().hex}", "items": [{"menuItemId": dish_id, "qty": 1}]}
    )
    assert s.status_code == 200, s.text
    order_id = s.json()["order"]["id"]

    # Reprint kitchen slip
    rep_k = client.post(
        "/api/orders/reprint",
        headers=headers,
        json={"orderId": order_id, "batchNo": 1, "categoryId": cat_id}
    )
    assert rep_k.status_code == 200
    assert rep_k.json()["status"] in ["printed", "ok"]

    # Attempt to reprint bill before paying -> 400
    rep_b_fail = client.post(f"/api/orders/{order_id}/reprint-bill", headers=headers)
    assert rep_b_fail.status_code == 400
    assert "unpaid order" in rep_b_fail.json()["message"]

    # Pay bill
    client.post(f"/api/orders/{order_id}/pay", headers=headers, json={"orderId": order_id, "requestId": f"pay-rep-{uuid.uuid4().hex}", "method": "card"})

    # Reprint bill after paying -> 200
    rep_b_ok = client.post(f"/api/orders/{order_id}/reprint-bill", headers=headers)
    assert rep_b_ok.status_code == 200
    assert rep_b_ok.json()["status"] in ["printed", "ok"]


def test_table_consistency_startup_self_check():
    db = SessionLocal()
    # Create inconsistent table 1: marked occupied with NO open order
    t1 = Table(
        id="test-tbl-inc1",
        floor_id="f1",
        number=881,
        capacity=4,
        status="occupied",
    )
    # Create inconsistent table 2: marked free but WITH open order
    t2 = Table(
        id="test-tbl-inc2",
        floor_id="f1",
        number=882,
        capacity=4,
        status="free",
    )
    db.add(t1)
    db.add(t2)
    db.flush()

    o2 = Order(
        id="test-ord-inc2",
        table_id=t2.id,
        floor_id="f1",
        waiter_id="u1",
        status="open",
        total=75.0,
    )
    db.add(o2)
    db.commit()

    # Run consistency check
    repairs = run_table_consistency_check(db)
    assert repairs >= 2

    # Verify repairs
    db.refresh(t1)
    db.refresh(t2)
    assert t1.status == "free"
    assert t2.status == "occupied"
    assert t2.current_order_id == o2.id

    # Cleanup
    db.delete(o2)
    db.delete(t1)
    db.delete(t2)
    db.commit()
    db.close()


def test_list_paid_orders_and_filtering():
    admin_token = get_auth_token("admin", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    res = client.get("/api/orders/paid?limit=10&page=1", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "totalAmount" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) <= 10


def test_printer_failure_does_not_abort_order(monkeypatch):
    from app.core.config import settings
    admin_token = get_auth_token("admin", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Simulate all printers failing
    monkeypatch.setattr(settings, "SIMULATE_FAIL_PRINTERS", "prn-kitchen,prn-cashier,prn-drinks,p1")

    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free", Table.is_active == True).first()
    dish = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
    t_id = table.id
    dish_id = dish.id
    db.close()

    # Sending order succeeds with 200, but print job has status "failed"
    res_send = client.post(
        "/api/orders/send",
        headers=headers,
        json={"tableId": t_id, "requestId": f"req-failprn-{datetime.datetime.utcnow().timestamp()}", "items": [{"menuItemId": dish_id, "qty": 1}]}
    )
    assert res_send.status_code == 200
    send_data = res_send.json()
    assert send_data["order"]["id"] is not None
    assert len(send_data["printJobs"]) >= 1
    assert send_data["printJobs"][0]["status"] == "failed"
    assert "Simulated printer failure" in send_data["printJobs"][0]["error"]

    # Paying also succeeds with 200, even if cashier printer fails
    order_id = send_data["order"]["id"]
    res_pay = client.post(
        f"/api/orders/{order_id}/pay",
        headers=headers,
        json={"orderId": order_id, "requestId": f"pay-failprn-{datetime.datetime.utcnow().timestamp()}", "method": "card"}
    )
    assert res_pay.status_code == 200
    pay_data = res_pay.json()
    assert pay_data["order"]["status"] == "paid"
    assert pay_data["billPrintJob"]["status"] == "failed"

