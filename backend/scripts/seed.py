#!/usr/bin/env python
"""
Database Seed and Deterministic Demo History Generator for Soufi Restaurant POS.

Usage:
    python backend/scripts/seed.py --init
    python backend/scripts/seed.py --demo [--days 90] [--seed 42] [--force-demo]
    python backend/scripts/seed.py --clear-demo
"""
import argparse
import logging
import math
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import text
from sqlalchemy.orm import Session

# Setup python path if executed directly
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.timeutil import get_local_timezone, compute_order_date_fields, compute_business_date
from app.models import Floor, Table, MenuItem, Order, OrderItem, DailySequence, PrintJob
from app.seed.initial_data import run_seed

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed")


def make_rng(seed: int):
    """Deterministic linear congruential generator matching frontend seededRng."""
    s = seed & 0xFFFFFFFF

    def rng():
        nonlocal s
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        return s / 4294967295.0

    return rng


def rnd_between(rng, min_v: int, max_v: int) -> int:
    return math.floor(rng() * (max_v - min_v + 1)) + min_v


def rnd_pick(rng, seq):
    return seq[math.floor(rng() * len(seq))]


def clear_demo_data(db: Session) -> dict:
    """Removes all demo orders, items, and print jobs, and recalculates daily sequences."""
    logger.info("Cleaning up demo data (is_demo=True)...")

    # Get demo order IDs
    demo_orders = db.query(Order.id).filter(Order.is_demo == True).all()
    demo_order_ids = [o[0] for o in demo_orders]
    demo_count = len(demo_order_ids)

    if demo_count > 0:
        # Delete related print jobs
        db.execute(text("DELETE FROM print_jobs WHERE order_id IN (SELECT id FROM orders WHERE is_demo = 1)"))
        # Delete related order items
        db.execute(text("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE is_demo = 1)"))
        # Delete demo orders
        db.execute(text("DELETE FROM orders WHERE is_demo = 1"))

    # Recalculate daily_sequences from remaining real orders
    db.execute(text("DELETE FROM daily_sequences WHERE business_date NOT IN (SELECT DISTINCT business_date FROM orders WHERE business_date IS NOT NULL)"))
    
    # Update last_seq for remaining business dates
    db.execute(text("""
        UPDATE daily_sequences
        SET last_seq = (
            SELECT COALESCE(COUNT(*), 0)
            FROM orders
            WHERE orders.business_date = daily_sequences.business_date
        )
    """))

    db.commit()
    logger.info("Cleared %d demo orders and their associated records.", demo_count)
    return {"cleared_orders": demo_count}


def generate_demo_history(db: Session, days: int = 90, seed: int = 42, force_demo: bool = False) -> int:
    """
    Generates deterministic historical orders matching frontend mock distribution.
    Orders are marked with is_demo = True.
    """
    if settings.APP_ENV == "prod" and not force_demo:
        print("\n" + "=" * 70)
        print("[SECURITY ERROR] Refusing to generate demo orders in PRODUCTION (APP_ENV=prod)!")
        print("Use --force-demo if you are absolutely certain you want to proceed.")
        print("=" * 70 + "\n")
        sys.exit(1)

    if settings.APP_ENV == "prod" and force_demo:
        print("\n" + "!" * 70)
        print("[SECURITY WARNING] Generating demo data in PRODUCTION environment with --force-demo override!")
        print("!" * 70 + "\n")

    # Clear prior demo data first to ensure clean idempotent replay
    clear_demo_data(db)

    # Ensure basic master data exists
    floors_count = db.query(Floor).count()
    if floors_count == 0:
        logger.info("No floors found. Running initial master data seed first...")
        run_seed(db)

    # Load active menu items per floor
    f1_db_items = (
        db.query(MenuItem)
        .filter(MenuItem.floor_id == "f1", MenuItem.is_active == True, MenuItem.is_deleted == False)
        .order_by(MenuItem.sort_order, MenuItem.id)
        .all()
    )
    f2_db_items = (
        db.query(MenuItem)
        .filter(MenuItem.floor_id == "f2", MenuItem.is_active == True, MenuItem.is_deleted == False)
        .order_by(MenuItem.sort_order, MenuItem.id)
        .all()
    )

    if not f1_db_items and not f2_db_items:
        raise RuntimeError("No active menu items found in database to generate orders from. Run --init first.")

    # Convert to lightweight dicts
    f1_items = [{"id": m.id, "name": m.name, "categoryId": m.category_id, "price": m.price} for m in f1_db_items]
    f2_items = [{"id": m.id, "name": m.name, "categoryId": m.category_id, "price": m.price} for m in (f2_db_items or f1_db_items)]

    tables_f1 = [t.id for t in db.query(Table).filter(Table.floor_id == "f1", Table.is_deleted == False).order_by(Table.number).all()] or ["f1-t1"]
    tables_f2 = [t.id for t in db.query(Table).filter(Table.floor_id == "f2", Table.is_deleted == False).order_by(Table.number).all()] or ["f2-t1"]

    tables_by_floor = {"f1": tables_f1, "f2": tables_f2}
    waiters_by_floor = {"f1": ["u2", "u4"], "f2": ["u3"]}

    payment_methods = ["cash", "cash", "cash", "card", "online"]
    peak_hours = [12, 13, 14, 19, 20, 21, 22]
    normal_hours = [11, 15, 16, 17, 18, 23]
    void_reasons = ["Wrong order", "Customer changed mind", "Out of stock", "Duplicate entry"]

    tz = get_local_timezone()
    today_local = datetime.now(tz).date()

    rng = make_rng(seed)
    history_order_count = 0

    orders_to_insert = []
    items_to_insert = []
    sequences_to_set = {}

    logger.info("Generating %d days of demo orders with seed=%d...", days, seed)

    for days_ago in range(days, 0, -1):
        target_date = today_local - timedelta(days=days_ago)
        # JS getDay(): 0=Sun, 5=Fri, 6=Sat
        dow = (target_date.weekday() + 1) % 7
        is_weekend = dow in (0, 5, 6)
        bills_for_day = rnd_between(rng, 70 if is_weekend else 40, 120 if is_weekend else 80)

        for b in range(bills_for_day):
            history_order_count += 1
            is_peak = rng() < 0.65
            hour = rnd_pick(rng, peak_hours) if is_peak else rnd_pick(rng, normal_hours)
            minute = rnd_between(rng, 0, 59)
            second = rnd_between(rng, 0, 59)

            local_dt = datetime(target_date.year, target_date.month, target_date.day, hour, minute, second, tzinfo=tz)
            paid_at_utc = local_dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
            b_date, local_hour, local_wday = compute_order_date_fields(paid_at_utc, start_hour=settings.BUSINESS_DAY_START_HOUR)

            floor_id = "f1" if rng() < 0.55 else "f2"
            floor_items = f1_items if floor_id == "f1" else f2_items
            table_id = rnd_pick(rng, tables_by_floor[floor_id])
            waiter_id = rnd_pick(rng, waiters_by_floor[floor_id])

            num_items = rnd_between(rng, 1, 4)
            order_items_list = []
            subtotal = 0.0

            for i in range(num_items):
                menu_item = rnd_pick(rng, floor_items)
                qty = rnd_between(rng, 1, 3)
                line_total = menu_item["price"] * qty
                subtotal += line_total

                sent_at = paid_at_utc - timedelta(minutes=rnd_between(rng, 10, 40))
                item_dict = {
                    "id": f"demo-oi-{history_order_count}-{i}",
                    "order_id": f"demo-ord-{history_order_count}",
                    "menu_item_id": menu_item["id"],
                    "name": menu_item["name"],
                    "category_id": menu_item["categoryId"],
                    "price": float(menu_item["price"]),
                    "qty": qty,
                    "batch_no": 1,
                    "sent_at": sent_at,
                    "voided": False,
                    "void_reason": None,
                    "voided_at": None,
                    "voided_by": None,
                    "voided_business_date": None,
                }

                # ~5% chance of void
                if rng() < 0.05 and len(order_items_list) > 0:
                    item_dict["voided"] = True
                    item_dict["void_reason"] = rnd_pick(rng, void_reasons)
                    item_dict["voided_at"] = paid_at_utc - timedelta(minutes=5)
                    item_dict["voided_by"] = "u1"
                    item_dict["voided_business_date"] = b_date
                    subtotal -= line_total

                order_items_list.append(item_dict)

            # ~8% chance of discount
            discount_amount = 0.0
            discount_type = None
            discount_value = None

            if rng() < 0.08 and subtotal > 500:
                if rng() < 0.5:
                    discount_type = "percent"
                    discount_value = rnd_pick(rng, [5, 10, 15, 20])
                    discount_amount = round((subtotal * discount_value) / 100.0)
                else:
                    discount_type = "amount"
                    discount_value = rnd_pick(rng, [50, 100, 200, 300])
                    discount_amount = min(float(discount_value), round(subtotal * 0.3))

            net_sales = subtotal - discount_amount
            tax = 0.0
            service_charge = 0.0
            total = net_sales + tax + service_charge

            method = rnd_pick(rng, payment_methods)
            bill_no = f"B-{b + 1:04d}"

            amt_received = total + rnd_between(rng, 0, 500) if method == "cash" else total
            change_due = amt_received - total if method == "cash" else 0.0
            created_at = paid_at_utc - timedelta(minutes=rnd_between(rng, 15, 90))

            order_dict = {
                "id": f"demo-ord-{history_order_count}",
                "table_id": table_id,
                "floor_id": floor_id,
                "waiter_id": waiter_id,
                "status": "paid",
                "subtotal": round(subtotal, 2),
                "tax": 0.0,
                "service_charge": 0.0,
                "discount": round(discount_amount, 2),
                "discount_type": discount_type,
                "discount_value": discount_value,
                "total": round(total, 2),
                "bill_no": bill_no,
                "payment_method": method,
                "amount_received": round(amt_received, 2),
                "change_due": round(change_due, 2),
                "created_at": created_at,
                "paid_at": paid_at_utc,
                "paid_by": waiter_id,
                "business_date": b_date,
                "paid_local_hour": local_hour,
                "paid_local_weekday": local_wday,
                "is_demo": True,
            }

            orders_to_insert.append(order_dict)
            items_to_insert.extend(order_items_list)

        sequences_to_set[b_date] = bills_for_day

    # Batch insert for high performance
    logger.info("Writing %d orders and %d order items to database...", len(orders_to_insert), len(items_to_insert))
    
    batch_size = 1000
    for i in range(0, len(orders_to_insert), batch_size):
        db.bulk_insert_mappings(Order, orders_to_insert[i:i + batch_size])
    
    for i in range(0, len(items_to_insert), batch_size):
        db.bulk_insert_mappings(OrderItem, items_to_insert[i:i + batch_size])

    # Update daily sequences
    for b_date, last_seq in sequences_to_set.items():
        seq = db.query(DailySequence).filter(DailySequence.business_date == b_date).first()
        if not seq:
            db.add(DailySequence(business_date=b_date, last_seq=last_seq))
        else:
            seq.last_seq = last_seq

    db.commit()
    logger.info("Successfully generated %d historical demo orders across %d days.", history_order_count, days)
    return history_order_count


def main():
    parser = argparse.ArgumentParser(description="Soufi POS Seed and Demo Generator")
    parser.add_argument("--init", action="store_true", help="Seed initial master data (floors, tables, menu, printers)")
    parser.add_argument("--demo", action="store_true", help="Generate deterministic historical orders for reports")
    parser.add_argument("--days", type=int, default=90, help="Number of historical days to generate (default: 90)")
    parser.add_argument("--seed", type=int, default=42, help="PRNG seed for deterministic output (default: 42)")
    parser.add_argument("--clear-demo", action="store_true", help="Remove all demo data from database")
    parser.add_argument("--force-demo", action="store_true", help="Override APP_ENV=prod check")

    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.clear_demo:
            clear_demo_data(db)
        elif args.demo:
            generate_demo_history(db, days=args.days, seed=args.seed, force_demo=args.force_demo)
        elif args.init:
            logger.info("Running initial master data seed...")
            run_seed(db)
            logger.info("Initial seed complete.")
        else:
            parser.print_help()
    finally:
        db.close()


if __name__ == "__main__":
    main()

