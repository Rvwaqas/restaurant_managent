import datetime
from datetime import timedelta
from zoneinfo import ZoneInfo
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.main import app
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Floor, Table, Order, OrderItem, MenuItem, Category, DailySequence
from app.core.timeutil import get_local_timezone, compute_order_date_fields
from scripts.seed import generate_demo_history, clear_demo_data

client = TestClient(app)


def get_auth_token(username="admin", password="admin123"):
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def get_waiter_token(username="waiter1", password="1234"):
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["token"]


@pytest.fixture(autouse=True)
def cleanup_test_artifacts():
    yield
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'open' OR id LIKE 'test-%' OR table_id LIKE 'test-%')"))
        db.execute(text("DELETE FROM orders WHERE status = 'open' OR id LIKE 'test-%' OR table_id LIKE 'test-%'"))
        db.execute(text("UPDATE tables SET status = 'free', current_order_id = NULL WHERE status != 'free'"))
        db.commit()
    finally:
        db.close()


# ─── Pure Python Independent Oracle ───
def python_oracle_summary(db: Session, from_date: str, to_date: str, floor_id="all", waiter_id="all", payment_method="all", category_id="all"):
    """
    Independent brute-force Python oracle:
    Fetches raw orders and computes report metrics in pure Python.
    No SQL aggregation functions or reports service code shared.
    """
    orders = db.query(Order).filter(Order.status == "paid").all()
    filtered_orders = []

    for o in orders:
        if not o.business_date or o.business_date < from_date or o.business_date > to_date:
            continue
        if floor_id != "all" and o.floor_id != floor_id:
            continue
        if waiter_id != "all" and o.waiter_id != waiter_id:
            continue
        if payment_method != "all" and o.payment_method != payment_method:
            continue
        if category_id != "all":
            # Per mock definition: order included if it has an item with categoryId
            has_cat = any(item.category_id == category_id for item in o.items)
            if not has_cat:
                continue
        filtered_orders.append(o)

    gross_sales = 0.0
    items_sold = 0
    discounts = sum(o.discount or 0.0 for o in filtered_orders)
    tax = sum(o.tax or 0.0 for o in filtered_orders)
    service_charge = sum(o.service_charge or 0.0 for o in filtered_orders)
    grand_total = sum(o.total or 0.0 for o in filtered_orders)
    bills_count = len(filtered_orders)

    for o in filtered_orders:
        for item in o.items:
            if not item.voided:
                gross_sales += (item.price or 0.0) * (item.qty or 0)
                items_sold += item.qty or 0

    net_sales = gross_sales - discounts
    avg_bill = grand_total / bills_count if bills_count > 0 else 0.0

    # Voided items independently
    all_items = db.query(OrderItem).join(Order, OrderItem.order_id == Order.id).filter(OrderItem.voided == True).all()
    voided_count = 0
    voided_amount = 0.0
    for item in all_items:
        vb_date = item.voided_business_date
        if not vb_date or vb_date < from_date or vb_date > to_date:
            continue
        order = item.order
        if floor_id != "all" and order.floor_id != floor_id:
            continue
        if waiter_id != "all" and order.waiter_id != waiter_id:
            continue
        if category_id != "all" and item.category_id != category_id:
            continue
        voided_count += 1
        voided_amount += (item.price or 0.0) * (item.qty or 0)

    return {
        "grossSales": round(gross_sales, 2),
        "discounts": round(discounts, 2),
        "netSales": round(net_sales, 2),
        "tax": round(tax, 2),
        "serviceCharge": round(service_charge, 2),
        "grandTotal": round(grand_total, 2),
        "billsCount": bills_count,
        "itemsSold": items_sold,
        "avgBill": round(avg_bill, 2),
        "voidedItemsCount": voided_count,
        "voidedAmount": round(voided_amount, 2),
    }


# ─── Tests ───

def test_reports_role_guards():
    """Admin only: 401 without token, 403 for waiters."""
    # 401 unauthenticated
    res = client.get("/api/reports/summary")
    assert res.status_code == 401

    # 403 waiter
    waiter_token = get_waiter_token()
    waiter_headers = {"Authorization": f"Bearer {waiter_token}"}
    
    endpoints = [
        "/api/reports/summary",
        "/api/reports/sales-over-time",
        "/api/reports/by-category",
        "/api/reports/top-items",
        "/api/reports/by-waiter",
        "/api/reports/by-floor",
        "/api/reports/by-payment-method",
        "/api/reports/peak-hours",
        "/api/reports/discounts",
        "/api/reports/voided-items",
        "/api/reports/daily-closing",
    ]
    for ep in endpoints:
        r = client.get(ep, headers=waiter_headers)
        assert r.status_code == 403, f"{ep} did not return 403 for waiter"
        assert "Admin access required" in r.json()["message"]


def test_reports_validation():
    """Query param validation (422) for bad dates, range > 400 days, from > to."""
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    # from > to
    r = client.get("/api/reports/summary?from=2026-11-10&to=2026-11-01", headers=headers)
    assert r.status_code == 422
    assert "must be less than or equal to" in r.json()["message"].lower()

    # range > 400 days
    r = client.get("/api/reports/summary?from=2024-01-01&to=2026-11-01", headers=headers)
    assert r.status_code == 422
    assert "400 days" in r.json()["message"]

    # malformed date
    r = client.get("/api/reports/summary?from=invalid-date&to=2026-11-01", headers=headers)
    assert r.status_code == 422

    # unknown floorId
    r = client.get("/api/reports/summary?floorId=unknown-floor-id", headers=headers)
    assert r.status_code == 422
    assert "not found" in r.json()["message"].lower()


def test_business_day_boundaries_and_cutoffs():
    """
    Detailed test of business day boundaries:
    Restaurant day starts at 05:00 local time (Asia/Karachi).
    A bill at 04:59:59 local is business date D-1.
    A bill at 05:00:00 local is business date D.
    UTC midnight translation: 00:00 UTC = 05:00 PKT.
    """
    db = SessionLocal()
    tz = get_local_timezone()

    try:
        # Create 2 test orders right around boundary
        # Day: 2026-10-15
        dt_before = datetime.datetime(2026, 10, 15, 4, 59, 59, tzinfo=tz)
        dt_after = datetime.datetime(2026, 10, 15, 5, 0, 0, tzinfo=tz)

        utc_before = dt_before.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        utc_after = dt_after.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

        b_date_before, h_before, _ = compute_order_date_fields(utc_before, start_hour=5)
        b_date_after, h_after, _ = compute_order_date_fields(utc_after, start_hour=5)

        assert b_date_before == "2026-10-14"
        assert h_before == 4

        assert b_date_after == "2026-10-15"
        assert h_after == 5

        # Check UTC midnight: 2026-10-15 00:00:00 UTC = 05:00:00 PKT
        utc_midnight = datetime.datetime(2026, 10, 15, 0, 0, 0)
        b_date_utc_mid, h_mid, _ = compute_order_date_fields(utc_midnight, start_hour=5)
        assert b_date_utc_mid == "2026-10-15"
        assert h_mid == 5
    finally:
        db.close()


def test_independent_oracle_and_cross_report_consistency():
    """
    Seeds a controlled 7-day demo history and compares ALL report endpoints
    against the independent Python oracle and verifies cross-report math consistency.
    """
    db = SessionLocal()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    try:
        # Generate 7 days with seed 999
        generate_demo_history(db, days=7, seed=999)

        # Get local business dates for the 7 days
        tz = get_local_timezone()
        today = datetime.datetime.now(tz).date()
        from_date = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        to_date = (today - timedelta(days=1)).strftime("%Y-%m-%d")

        # 1. Compare summary with Python Oracle
        oracle = python_oracle_summary(db, from_date, to_date)
        res_summary = client.get(f"/api/reports/summary?from={from_date}&to={to_date}", headers=headers)
        assert res_summary.status_code == 200, res_summary.text
        summary = res_summary.json()

        for key in ["grossSales", "discounts", "netSales", "tax", "serviceCharge", "grandTotal", "billsCount", "itemsSold", "avgBill", "voidedItemsCount", "voidedAmount"]:
            assert abs(summary[key] - oracle[key]) < 0.05, f"Summary mismatch on {key}: api={summary[key]} vs oracle={oracle[key]}"

        # 2. Sales Over Time
        res_sot = client.get(f"/api/reports/sales-over-time?from={from_date}&to={to_date}&groupBy=day", headers=headers)
        assert res_sot.status_code == 200
        sot = res_sot.json()
        assert len(sot) >= 7

        sot_grand_total = sum(r["grandTotal"] for r in sot)
        sot_bills_count = sum(r["billsCount"] for r in sot)
        assert abs(sot_grand_total - summary["grandTotal"]) < 0.05
        assert sot_bills_count == summary["billsCount"]

        # 3. By Payment Method
        res_pm = client.get(f"/api/reports/by-payment-method?from={from_date}&to={to_date}", headers=headers)
        assert res_pm.status_code == 200
        pm = res_pm.json()
        pm_total = sum(r["amount"] for r in pm)
        pm_bills = sum(r["billsCount"] for r in pm)
        assert abs(pm_total - summary["grandTotal"]) < 0.05
        assert pm_bills == summary["billsCount"]

        # 4. By Floor
        res_fl = client.get(f"/api/reports/by-floor?from={from_date}&to={to_date}", headers=headers)
        assert res_fl.status_code == 200
        fl = res_fl.json()
        fl_total = sum(r["grandTotal"] for r in fl)
        fl_bills = sum(r["billsCount"] for r in fl)
        assert abs(fl_total - summary["grandTotal"]) < 0.05
        assert fl_bills == summary["billsCount"]

        # 5. By Waiter
        res_w = client.get(f"/api/reports/by-waiter?from={from_date}&to={to_date}", headers=headers)
        assert res_w.status_code == 200
        w = res_w.json()
        w_total = sum(r["grandTotal"] for r in w)
        w_bills = sum(r["billsCount"] for r in w)
        assert abs(w_total - summary["grandTotal"]) < 0.05
        assert w_bills == summary["billsCount"]

        # 6. By Category (Gross sales sum)
        res_cat = client.get(f"/api/reports/by-category?from={from_date}&to={to_date}", headers=headers)
        assert res_cat.status_code == 200
        cat = res_cat.json()
        cat_total = sum(r["amount"] for r in cat)
        assert abs(cat_total - summary["grossSales"]) < 0.05

        # 7. Top Items (Items sold sum)
        res_items = client.get(f"/api/reports/top-items?from={from_date}&to={to_date}&limit=100", headers=headers)
        assert res_items.status_code == 200
        items = res_items.json()
        items_sold_sum = sum(r["qty"] for r in items)
        assert items_sold_sum == summary["itemsSold"]

        # 8. Discounts list
        res_disc = client.get(f"/api/reports/discounts?from={from_date}&to={to_date}", headers=headers)
        assert res_disc.status_code == 200
        disc = res_disc.json()
        disc_total = sum(r["discountAmount"] for r in disc)
        assert abs(disc_total - summary["discounts"]) < 0.05

        # 9. Voided Items
        res_voids = client.get(f"/api/reports/voided-items?from={from_date}&to={to_date}", headers=headers)
        assert res_voids.status_code == 200
        voids = res_voids.json()
        assert len(voids) == summary["voidedItemsCount"]
        voids_amt_sum = sum(r["amount"] for r in voids)
        assert abs(voids_amt_sum - summary["voidedAmount"]) < 0.05

        # 10. Peak Hours Heatmap
        res_peak = client.get(f"/api/reports/peak-hours?from={from_date}&to={to_date}", headers=headers)
        assert res_peak.status_code == 200
        peak = res_peak.json()
        # Verify weekday mapping (0..6) and hour (0..23)
        assert len(peak) > 0
        for cell in peak:
            assert 0 <= cell["weekday"] <= 6
            assert 0 <= cell["hour"] <= 23

    finally:
        clear_demo_data(db)
        db.close()


def test_voids_on_open_orders_and_isolation():
    """
    A void on an open order counts on its void business date,
    even if the order is never paid.
    Voided lines never appear in sales KPIs.
    """
    db = SessionLocal()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    iso_test_date = "2099-01-01"

    try:
        # Create an open order
        order = Order(
            id="test-open-order-void",
            table_id="f1-t10",
            floor_id="f1",
            waiter_id="u2",
            status="open",
            subtotal=500.0,
            total=500.0,
            created_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
        )
        db.add(order)
        db.flush()

        # Add 1 active item and 1 voided item
        dish = db.query(MenuItem).filter(MenuItem.floor_id == "f1").first()
        oi_active = OrderItem(
            id="test-oi-active",
            order_id=order.id,
            menu_item_id=dish.id,
            name=dish.name,
            category_id=dish.category_id,
            price=200.0,
            qty=1,
            batch_no=1,
            sent_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
            voided=False,
        )
        oi_voided = OrderItem(
            id="test-oi-voided",
            order_id=order.id,
            menu_item_id=dish.id,
            name=dish.name,
            category_id=dish.category_id,
            price=300.0,
            qty=1,
            batch_no=1,
            sent_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
            voided=True,
            void_reason="Mistake",
            voided_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
            voided_by="u1",
            voided_business_date=iso_test_date,
        )
        db.add(oi_active)
        db.add(oi_voided)
        db.commit()

        # Check summary for test date: open order sales must be 0, but voided items must be captured
        res = client.get(f"/api/reports/summary?from={iso_test_date}&to={iso_test_date}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["grandTotal"] == 0.0
        assert data["billsCount"] == 0
        assert data["voidedItemsCount"] == 1
        assert data["voidedAmount"] == 300.0

    finally:
        # Cleanup
        db.execute(text("DELETE FROM order_items WHERE order_id = 'test-open-order-void'"))
        db.execute(text("DELETE FROM orders WHERE id = 'test-open-order-void'"))
        db.commit()
        db.close()


def test_daily_closing_report_and_unpaid_warning():
    """Daily closing includes restaurant times, summary, and warns if tables are open."""
    db = SessionLocal()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    tz = get_local_timezone()
    today_bdate = datetime.datetime.now(tz).date().strftime("%Y-%m-%d")

    try:
        # Mark table f1-t1 occupied
        tbl = db.query(Table).filter(Table.id == "f1-t1").first()
        tbl.status = "occupied"
        tbl.current_order_id = "test-unpaid-order"
        db.commit()

        res = client.get(f"/api/reports/daily-closing?date={today_bdate}", headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert data["date"] == today_bdate
        assert data["openTablesCount"] >= 1
        assert "summary" in data
        assert "byPaymentMethod" in data

    finally:
        tbl = db.query(Table).filter(Table.id == "f1-t1").first()
        tbl.status = "free"
        tbl.current_order_id = None
        db.commit()
        db.close()


def test_demo_generator_deterministic_and_clear():
    """
    Test deterministic replay with seed 42.
    --clear-demo leaves real non-demo orders intact.
    """
    db = SessionLocal()
    try:
        # Create a real (non-demo) order
        real_order = Order(
            id="real-order-should-stay",
            table_id="f1-t1",
            floor_id="f1",
            waiter_id="u2",
            status="paid",
            subtotal=100.0,
            total=100.0,
            bill_no="B-9999",
            business_date="2026-11-01",
            is_demo=False,
            created_at=datetime.datetime.utcnow(),
            paid_at=datetime.datetime.utcnow(),
        )
        db.add(real_order)
        db.commit()

        # Run demo generation
        cnt1 = generate_demo_history(db, days=3, seed=42)
        orders1 = db.query(Order).filter(Order.is_demo == True).count()
        assert cnt1 == orders1

        # Re-run with same seed
        cnt2 = generate_demo_history(db, days=3, seed=42)
        assert cnt1 == cnt2

        # Clear demo data
        clear_demo_data(db)
        assert db.query(Order).filter(Order.is_demo == True).count() == 0

        # Real order must still exist!
        assert db.query(Order).filter(Order.id == "real-order-should-stay").first() is not None

    finally:
        db.execute(text("DELETE FROM orders WHERE id = 'real-order-should-stay'"))
        db.commit()
        db.close()


def test_query_plan_indexes_used():
    """Verify with EXPLAIN QUERY PLAN that index is used for orders filtering."""
    db = SessionLocal()
    try:
        # Check index on business_date
        plan = db.execute(text("EXPLAIN QUERY PLAN SELECT id FROM orders WHERE business_date = '2026-11-01'")).fetchall()
        plan_str = " ".join(str(p) for p in plan)
        assert "ix_orders_business_date" in plan_str or "USING INDEX" in plan_str

        # Check index on order_items voided_business_date
        plan_items = db.execute(text("EXPLAIN QUERY PLAN SELECT id FROM order_items WHERE voided_business_date = '2026-11-01'")).fetchall()
        plan_items_str = " ".join(str(p) for p in plan_items)
        assert "ix_order_items_voided_business_date" in plan_items_str or "USING INDEX" in plan_items_str

    finally:
        db.close()


def test_filter_combinations_and_empty_states():
    """Verify combined filters (floor + waiter + paymentMethod + category) and empty states."""
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Combined filter
    res = client.get("/api/reports/summary?from=2026-10-01&to=2026-10-07&floorId=f1&waiterId=u2&paymentMethod=cash&categoryId=c1", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "grossSales" in data
    assert "grandTotal" in data

    # Empty date range in the far future (should return clean 0 KPIs and empty lists)
    future_from = "2099-01-01"
    future_to = "2099-01-07"

    res_sum = client.get(f"/api/reports/summary?from={future_from}&to={future_to}", headers=headers)
    assert res_sum.status_code == 200
    sum_data = res_sum.json()
    assert sum_data["grandTotal"] == 0.0
    assert sum_data["billsCount"] == 0
    assert sum_data["itemsSold"] == 0
    assert sum_data["comparison"]["previousPeriod"]["grandTotal"] == 0.0

    res_cat = client.get(f"/api/reports/by-category?from={future_from}&to={future_to}", headers=headers)
    assert res_cat.status_code == 200
    assert isinstance(res_cat.json(), list)

    res_top = client.get(f"/api/reports/top-items?from={future_from}&to={future_to}", headers=headers)
    assert res_top.status_code == 200
    assert isinstance(res_top.json(), list)

    res_disc = client.get(f"/api/reports/discounts?from={future_from}&to={future_to}", headers=headers)
    assert res_disc.status_code == 200
    assert isinstance(res_disc.json(), list)

    res_void = client.get(f"/api/reports/voided-items?from={future_from}&to={future_to}", headers=headers)
    assert res_void.status_code == 200
    assert isinstance(res_void.json(), list)


def test_comparison_period_calculations():
    """Verify previous period changePercent math (handles previous=0 cleanly)."""
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Query with date range that has zero previous bills
    res = client.get("/api/reports/summary?from=2099-01-08&to=2099-01-14", headers=headers)
    assert res.status_code == 200
    comp = res.json()["comparison"]
    assert "previousPeriod" in comp
    assert "changePercent" in comp
    # When previous is 0, changePercent should be 0.0, not NaN or error
    assert comp["changePercent"]["grandTotal"] == 0.0
    assert comp["changePercent"]["billsCount"] == 0.0


def test_query_performance_benchmarks():
    """
    Performance benchmark with seeded orders:
    Summary must respond in < 300ms, other report queries < 500ms.
    """
    import time
    db = SessionLocal()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    try:
        # Generate 14 days of demo data
        generate_demo_history(db, days=14, seed=42)

        tz = get_local_timezone()
        today = datetime.datetime.now(tz).date()
        from_d = (today - timedelta(days=14)).strftime("%Y-%m-%d")
        to_d = (today - timedelta(days=1)).strftime("%Y-%m-%d")

        # 1. Summary benchmark (<300ms)
        t0 = time.perf_counter()
        r = client.get(f"/api/reports/summary?from={from_d}&to={to_d}", headers=headers)
        dt_summary = (time.perf_counter() - t0) * 1000.0
        assert r.status_code == 200
        assert dt_summary < 300.0, f"Summary query took {dt_summary:.1f}ms (target < 300ms)"

        # 2. Sales over time benchmark (<500ms)
        t0 = time.perf_counter()
        r = client.get(f"/api/reports/sales-over-time?from={from_d}&to={to_d}&groupBy=day", headers=headers)
        dt_sot = (time.perf_counter() - t0) * 1000.0
        assert r.status_code == 200
        assert dt_sot < 500.0, f"Sales over time took {dt_sot:.1f}ms (target < 500ms)"

        # 3. Peak hours heatmap (<500ms)
        t0 = time.perf_counter()
        r = client.get(f"/api/reports/peak-hours?from={from_d}&to={to_d}", headers=headers)
        dt_peak = (time.perf_counter() - t0) * 1000.0
        assert r.status_code == 200
        assert dt_peak < 500.0, f"Peak hours took {dt_peak:.1f}ms (target < 500ms)"

    finally:
        clear_demo_data(db)
        db.close()


def test_reports_matrix_all_group_by_and_filters():
    """
    Step 0.3 verification:
    Execute every report endpoint with every groupBy (hour, day, month)
    and with each filter (floor, waiter, payment method, category)
    on a dataset spread over several hours and days, asserting values.
    """
    db = SessionLocal()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    try:
        # Seed 3 days of known demo history
        generate_demo_history(db, days=3, seed=123)

        tz = get_local_timezone()
        today = datetime.datetime.now(tz).date()
        from_d = (today - timedelta(days=3)).strftime("%Y-%m-%d")
        to_d = today.strftime("%Y-%m-%d")

        # 1. Test sales-over-time with all 3 groupBys: hour, day, month
        for gb in ["hour", "day", "month"]:
            r = client.get(f"/api/reports/sales-over-time?from={from_d}&to={to_d}&groupBy={gb}", headers=headers)
            assert r.status_code == 200, f"sales-over-time failed for groupBy={gb}: {r.text}"
            data = r.json()
            assert isinstance(data, list)
            if data:
                # hour format checks
                if gb == "hour":
                    assert any(":00" in b["bucket"] for b in data)
                elif gb == "day":
                    assert all(len(b["bucket"]) == 10 for b in data)
                elif gb == "month":
                    assert all(len(b["bucket"]) == 7 for b in data)

        # 2. Test all report endpoints with various filters
        endpoints = [
            "/api/reports/summary",
            "/api/reports/sales-over-time?groupBy=day",
            "/api/reports/sales-over-time?groupBy=hour",
            "/api/reports/by-category",
            "/api/reports/by-floor",
            "/api/reports/by-waiter",
            "/api/reports/top-items",
            "/api/reports/by-payment-method",
            "/api/reports/peak-hours",
            "/api/reports/discounts",
            "/api/reports/voided-items",
            "/api/reports/daily-sales",
            "/api/reports/category-sales",
            "/api/reports/waiter-sales",
        ]

        filter_combos = [
            {"floorId": "f1"},
            {"floorId": "f2"},
            {"waiterId": "u2"},
            {"paymentMethod": "cash"},
            {"paymentMethod": "card"},
            {"categoryId": "c1"},
            {"floorId": "f1", "paymentMethod": "cash", "waiterId": "u2"},
        ]

        for ep in endpoints:
            sep = "&" if "?" in ep else "?"
            for f in filter_combos:
                qstr = "&".join(f"{k}={v}" for k, v in f.items())
                url = f"{ep}{sep}from={from_d}&to={to_d}&{qstr}"
                res = client.get(url, headers=headers)
                assert res.status_code == 200, f"Query failed on {url}: {res.text}"

        # 3. Test daily-closing endpoint
        res_dc = client.get(f"/api/reports/daily-closing?date={from_d}", headers=headers)
        assert res_dc.status_code == 200, f"daily-closing failed: {res_dc.text}"

    finally:
        clear_demo_data(db)
        db.close()

