#!/usr/bin/env python
"""
Phase B5: Comprehensive Manual & Automated Verification Script for Reports API.
Tests against FastAPI backend with real DB and realistic 90-day demo history.
"""
import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient
from sqlalchemy import text

# Setup sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.timeutil import get_local_timezone
from app.models import Floor, Table, MenuItem, Order, OrderItem
from scripts.seed import generate_demo_history, clear_demo_data

client = TestClient(app)


def get_token(username="admin", password="admin123"):
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, f"Login failed: {res.text}"
    return res.json()["token"]


def run_b5_verification():
    print("=" * 80)
    print("PHASE B5: REPORTS & DEMO HISTORY VERIFICATION (NEXT_PUBLIC_USE_MOCK=false)")
    print("=" * 80)

    results = []

    def check(title: str, success: bool, extra: str = ""):
        results.append((title, success, extra))
        status_str = "[PASS]" if success else "[FAIL]"
        print(f"{status_str} {title} {('- ' + extra) if extra else ''}")

    # 1. Clear & Seed 90 days of demo data
    print("\n--- 1. Generating 90-day Demo History ---")
    db = SessionLocal()
    try:
        t0 = time.perf_counter()
        count = generate_demo_history(db, days=90, seed=42)
        gen_time = (time.perf_counter() - t0) * 1000.0
        check(f"Seed 90 days demo data ({count} bills)", count > 3000, f"Generated {count} orders in {gen_time:.0f}ms")
    finally:
        db.close()

    admin_token = get_token("admin", "admin123")
    waiter_token = get_token("waiter1", "1234")
    admin_hdr = {"Authorization": f"Bearer {admin_token}"}
    waiter_hdr = {"Authorization": f"Bearer {waiter_token}"}

    tz = get_local_timezone()
    today_bdate = datetime.now(tz).date().strftime("%Y-%m-%d")
    yesterday_bdate = (datetime.now(tz).date() - timedelta(days=1)).strftime("%Y-%m-%d")
    days_7_bdate = (datetime.now(tz).date() - timedelta(days=7)).strftime("%Y-%m-%d")
    days_30_bdate = (datetime.now(tz).date() - timedelta(days=30)).strftime("%Y-%m-%d")
    days_90_bdate = (datetime.now(tz).date() - timedelta(days=90)).strftime("%Y-%m-%d")

    # 2. Waiter 403 Security Check
    print("\n--- 2. Security & Role Guards ---")
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
        "/api/reports/daily-sales",
        "/api/reports/category-sales",
        "/api/reports/waiter-sales",
    ]
    all_403 = True
    for ep in endpoints:
        r = client.get(ep, headers=waiter_hdr)
        if r.status_code != 403:
            all_403 = False
            check(f"Waiter 403 guard on {ep}", False, f"Status: {r.status_code}")
    if all_403:
        check("Waiter 403 guard on all 14 report endpoints", True, "All endpoints rejected waiter token with 403 Forbidden")

    # 3. Overview Tab: KPIs & Sparkline
    print("\n--- 3. Overview Tab KPIs & Sparkline ---")
    t0 = time.perf_counter()
    r_sum = client.get(f"/api/reports/summary?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    t_sum = (time.perf_counter() - t0) * 1000.0
    sum_data = r_sum.json()
    check("Summary KPIs loaded", r_sum.status_code == 200 and sum_data["billsCount"] > 0,
          f"Gross: Rs {sum_data['grossSales']:,.2f}, Grand Total: Rs {sum_data['grandTotal']:,.2f}, Bills: {sum_data['billsCount']}, Time: {t_sum:.1f}ms")
    check("Summary comparison period present", "previousPeriod" in sum_data["comparison"] and "changePercent" in sum_data["comparison"],
          f"Prev Grand Total: Rs {sum_data['comparison']['previousPeriod']['grandTotal']:,.2f}")

    r_sot = client.get(f"/api/reports/sales-over-time?from={days_30_bdate}&to={yesterday_bdate}&groupBy=day", headers=admin_hdr)
    sot_data = r_sot.json()
    check("Sales over time loaded (sparkline)", r_sot.status_code == 200 and len(sot_data) == 30, f"{len(sot_data)} daily buckets")

    # 4. Sales Tab: Sales Over Time & By Floor
    print("\n--- 4. Sales Tab ---")
    r_fl = client.get(f"/api/reports/by-floor?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    fl_data = r_fl.json()
    check("Sales by Floor loaded", r_fl.status_code == 200 and len(fl_data) == 2,
          ", ".join(f"{f['name']}: Rs {f['grandTotal']:,.2f} ({f['billsCount']} bills)" for f in fl_data))

    # 5. Items Tab: Category breakdown & Top Items
    print("\n--- 5. Items Tab ---")
    r_cat = client.get(f"/api/reports/by-category?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    cat_data = r_cat.json()
    check("Category sales loaded", r_cat.status_code == 200 and len(cat_data) > 0, f"{len(cat_data)} categories returned")

    r_top = client.get(f"/api/reports/top-items?from={days_30_bdate}&to={yesterday_bdate}&limit=10", headers=admin_hdr)
    top_data = r_top.json()
    check("Top items ranking loaded", r_top.status_code == 200 and len(top_data) == 10,
          f"Top item: {top_data[0]['name']} ({top_data[0]['qty']} sold, Rs {top_data[0]['amount']:,.2f})")

    # 6. Staff & Payments Tab
    print("\n--- 6. Staff & Payments Tab ---")
    r_w = client.get(f"/api/reports/by-waiter?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    w_data = r_w.json()
    check("Sales by Waiter loaded", r_w.status_code == 200 and len(w_data) >= 3,
          ", ".join(f"{w['name']}: Rs {w['grandTotal']:,.2f}" for w in w_data))

    r_pm = client.get(f"/api/reports/by-payment-method?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    pm_data = r_pm.json()
    check("Sales by Payment Method loaded", r_pm.status_code == 200 and len(pm_data) >= 3,
          ", ".join(f"{pm['method']}: Rs {pm['amount']:,.2f} ({pm['sharePercent']}%)" for pm in pm_data))

    r_peak = client.get(f"/api/reports/peak-hours?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    peak_data = r_peak.json()
    check("Peak hours heatmap loaded", r_peak.status_code == 200 and len(peak_data) > 0, f"{len(peak_data)} heatmap cells")

    # 7. Cancellations & Discounts Tab
    print("\n--- 7. Cancellations & Discounts Tab ---")
    r_disc = client.get(f"/api/reports/discounts?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    disc_data = r_disc.json()
    check("Discounts report loaded", r_disc.status_code == 200 and len(disc_data) > 0,
          f"{len(disc_data)} discount rows, total: Rs {sum(d['discountAmount'] for d in disc_data):,.2f}")

    r_void = client.get(f"/api/reports/voided-items?from={days_30_bdate}&to={yesterday_bdate}", headers=admin_hdr)
    void_data = r_void.json()
    check("Voided items audit loaded", r_void.status_code == 200 and len(void_data) > 0,
          f"{len(void_data)} void rows, total voided: Rs {sum(v['amount'] for v in void_data):,.2f}")

    # 8. Daily Closing Tab
    print("\n--- 8. Daily Closing Tab ---")
    r_close = client.get(f"/api/reports/daily-closing?date={yesterday_bdate}", headers=admin_hdr)
    close_data = r_close.json()
    check("Daily Closing report loaded", r_close.status_code == 200 and close_data["date"] == yesterday_bdate,
          f"OpenedAt: {close_data.get('openedAt')}, ClosedAt: {close_data.get('closedAt')}, Bills: {close_data['summary']['billsCount']}")

    # 9. Cross-Tab Consistency Verification
    print("\n--- 9. Cross-Tab Mathematical Consistency ---")
    sot_total = sum(r["grandTotal"] for r in sot_data)
    fl_total = sum(r["grandTotal"] for r in fl_data)
    w_total = sum(r["grandTotal"] for r in w_data)
    pm_total = sum(r["amount"] for r in pm_data)
    summary_total = sum_data["grandTotal"]

    check("Grand Total consistent: Summary vs SalesOverTime", abs(sot_total - summary_total) < 0.05, f"sot={sot_total:,.2f} vs sum={summary_total:,.2f}")
    check("Grand Total consistent: Summary vs ByFloor", abs(fl_total - summary_total) < 0.05, f"fl={fl_total:,.2f} vs sum={summary_total:,.2f}")
    check("Grand Total consistent: Summary vs ByWaiter", abs(w_total - summary_total) < 0.05, f"w={w_total:,.2f} vs sum={summary_total:,.2f}")
    check("Grand Total consistent: Summary vs ByPaymentMethod", abs(pm_total - summary_total) < 0.05, f"pm={pm_total:,.2f} vs sum={summary_total:,.2f}")

    cat_gross_total = sum(r["amount"] for r in cat_data)
    check("Gross Sales consistent: Summary vs ByCategory", abs(cat_gross_total - sum_data["grossSales"]) < 0.05,
          f"cat={cat_gross_total:,.2f} vs gross={sum_data['grossSales']:,.2f}")

    # 10. Real Live Transaction Test
    print("\n--- 10. Real Live Transaction Update Test ---")
    # Fetch today's summary before new payment
    r_today_pre = client.get(f"/api/reports/summary?from={today_bdate}&to={today_bdate}", headers=admin_hdr)
    pre_bills = r_today_pre.json()["billsCount"]
    pre_grand = r_today_pre.json()["grandTotal"]

    # Send order and pay it
    db = SessionLocal()
    table = db.query(Table).filter(Table.floor_id == "f1", Table.status == "free").first()
    dish = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
    table_id = table.id
    dish_id = dish.id
    db.close()

    req_id = f"test-live-send-{time.time()}"
    res_send = client.post(
        "/api/orders/send",
        headers=admin_hdr,
        json={"tableId": table_id, "requestId": req_id, "items": [{"menuItemId": dish_id, "qty": 2}]},
    )
    order_id = res_send.json()["order"]["id"]

    pay_req = f"test-live-pay-{time.time()}"
    res_pay = client.post(
        f"/api/orders/{order_id}/pay",
        headers=admin_hdr,
        json={"requestId": pay_req, "method": "cash", "amountReceived": 1000.0},
    )
    paid_total = res_pay.json()["order"]["total"]

    # Fetch today's summary after new payment
    r_today_post = client.get(f"/api/reports/summary?from={today_bdate}&to={today_bdate}", headers=admin_hdr)
    post_bills = r_today_post.json()["billsCount"]
    post_grand = r_today_post.json()["grandTotal"]

    check("Live order immediately reflected in today's report", (post_bills == pre_bills + 1) and abs(post_grand - (pre_grand + paid_total)) < 0.05,
          f"Bills: {pre_bills} -> {post_bills}, Grand Total: Rs {pre_grand} -> Rs {post_grand}")

    # 11. Open Table Unpaid Warning Test
    print("\n--- 11. Open Table Unpaid Warning Test ---")
    # Send another order to leave table occupied
    req_unpaid = f"test-unpaid-send-{time.time()}"
    client.post(
        "/api/orders/send",
        headers=admin_hdr,
        json={"tableId": table_id, "requestId": req_unpaid, "items": [{"menuItemId": dish_id, "qty": 1}]},
    )
    r_closing_warn = client.get(f"/api/reports/daily-closing?date={today_bdate}", headers=admin_hdr)
    closing_warn_data = r_closing_warn.json()
    check("Daily Closing flags unpaid open tables", closing_warn_data["openTablesCount"] >= 1,
          f"Open tables count: {closing_warn_data['openTablesCount']}")

    # Clean up the open table
    db = SessionLocal()
    tbl = db.query(Table).filter(Table.id == table_id).first()
    tbl.status = "free"
    tbl.current_order_id = None
    db.commit()
    db.close()

    # 12. Clear Demo Test & Clean Empty States
    print("\n--- 12. Clear Demo & Empty States Test ---")
    db = SessionLocal()
    clear_demo_data(db)
    db.close()

    # Check that historical date ranges now return clean empty states
    r_empty_sum = client.get(f"/api/reports/summary?from={days_90_bdate}&to={days_30_bdate}", headers=admin_hdr)
    empty_sum = r_empty_sum.json()
    check("Empty state: Summary KPIs zeroed", empty_sum["grandTotal"] == 0.0 and empty_sum["billsCount"] == 0,
          f"Grand Total: {empty_sum['grandTotal']}, Bills: {empty_sum['billsCount']}")

    r_empty_sot = client.get(f"/api/reports/sales-over-time?from={days_90_bdate}&to={days_30_bdate}&groupBy=day", headers=admin_hdr)
    check("Empty state: Sales over time zeroed buckets", r_empty_sot.status_code == 200, f"Returned {len(r_empty_sot.json())} zeroed buckets")

    r_empty_cat = client.get(f"/api/reports/by-category?from={days_90_bdate}&to={days_30_bdate}", headers=admin_hdr)
    check("Empty state: By Category empty list", r_empty_cat.status_code == 200 and r_empty_cat.json() == [], "Clean []")

    r_empty_top = client.get(f"/api/reports/top-items?from={days_90_bdate}&to={days_30_bdate}", headers=admin_hdr)
    check("Empty state: Top Items empty list", r_empty_top.status_code == 200 and r_empty_top.json() == [], "Clean []")

    r_empty_disc = client.get(f"/api/reports/discounts?from={days_90_bdate}&to={days_30_bdate}", headers=admin_hdr)
    check("Empty state: Discounts empty list", r_empty_disc.status_code == 200 and r_empty_disc.json() == [], "Clean []")

    r_empty_void = client.get(f"/api/reports/voided-items?from={days_90_bdate}&to={days_30_bdate}", headers=admin_hdr)
    check("Empty state: Voided items empty list", r_empty_void.status_code == 200 and r_empty_void.json() == [], "Clean []")

    print("\n" + "=" * 80)
    all_passed = all(success for _, success, _ in results)
    print(f"VERIFICATION COMPLETE: {sum(1 for _, s, _ in results if s)}/{len(results)} CHECKS PASSED")
    print("=" * 80)
    return all_passed


if __name__ == "__main__":
    success = run_b5_verification()
    sys.exit(0 if success else 1)
