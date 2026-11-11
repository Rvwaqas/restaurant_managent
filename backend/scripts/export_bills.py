#!/usr/bin/env python3
"""Export Paid Bills CLI Tool.

Exports paid bills and itemized details for tax or accounting purposes.
Outputs CSV (with UTF-8 BOM for Microsoft Excel) or JSON.

Usage:
    python scripts/export_bills.py --from 2026-01-01 --to 2026-12-31 [--format csv|json] [--out filename]
"""

import sys
import argparse
import csv
import json
import sqlite3
import datetime
from pathlib import Path

# Add backend directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings
from app.services.backup import get_sqlite_path


def main():
    parser = argparse.ArgumentParser(description="Export paid bills in date range")
    parser.add_argument("--from", dest="from_date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="to_date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--format", choices=["csv", "json"], default="csv", help="Output format")
    parser.add_argument("--out", help="Output file path (default: stdout for csv, or auto filename)")
    args = parser.parse_args()

    # Validate dates
    try:
        f_dt = datetime.datetime.strptime(args.from_date, "%Y-%m-%d").date()
        t_dt = datetime.datetime.strptime(args.to_date, "%Y-%m-%d").date()
        if f_dt > t_dt:
            print("Error: --from date cannot be after --to date", file=sys.stderr)
            sys.exit(1)
    except ValueError as e:
        print(f"Error parsing date: {e}", file=sys.stderr)
        sys.exit(1)

    rel_path = get_sqlite_path(settings.DATABASE_URL)
    candidates = [Path(rel_path).resolve(), (PROJECT_ROOT / rel_path).resolve(), (BACKEND_DIR / rel_path).resolve()]
    db_path = next((str(c) for c in candidates if c.exists()), str(candidates[0]))

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    query = """
        SELECT 
            o.id,
            o.bill_no,
            o.paid_at,
            o.business_date,
            t.number AS table_number,
            o.floor_id,
            o.waiter_id,
            o.payment_method,
            o.subtotal,
            o.tax,
            o.discount,
            o.total,
            o.amount_received,
            o.change_due
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE o.status = 'paid'
          AND date(o.paid_at) >= ?
          AND date(o.paid_at) <= ?
        ORDER BY o.paid_at ASC
    """

    cur.execute(query, (args.from_date, args.to_date))
    rows = cur.fetchall()

    bills = []
    order_ids = [r[0] for r in rows]

    # Fetch items for these orders
    items_by_order = {}
    if order_ids:
        cur.execute(
            f"""
            SELECT order_id, name, qty, price, (price * qty) AS total_price, voided
            FROM order_items
            WHERE order_id IN ({','.join(['?'] * len(order_ids))})
            ORDER BY id ASC
            """,
            order_ids,
        )
        for i_row in cur.fetchall():
            oid = i_row[0]
            if oid not in items_by_order:
                items_by_order[oid] = []
            items_by_order[oid].append({
                "name": i_row[1],
                "qty": i_row[2],
                "unitPrice": i_row[3],
                "totalPrice": i_row[4],
                "voided": bool(i_row[5]),
            })

    conn.close()

    for r in rows:
        oid = r[0]
        bills.append({
            "orderId": oid,
            "billNumber": r[1],
            "paidAt": r[2],
            "businessDate": r[3],
            "tableNumber": r[4],
            "floorId": r[5],
            "waiter": r[6],
            "paymentMethod": r[7],
            "subtotal": r[8],
            "tax": r[9],
            "discount": r[10],
            "total": r[11],
            "amountReceived": r[12],
            "changeDue": r[13],
            "items": items_by_order.get(oid, []),
        })

    if args.format == "json":
        out_content = json.dumps(bills, indent=2, default=str)
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                f.write(out_content)
            print(f"Exported {len(bills)} bills to {args.out}")
        else:
            print(out_content)
    else:
        # CSV with UTF-8 BOM
        out_target = open(args.out, "w", newline="", encoding="utf-8-sig") if args.out else sys.stdout

        writer = csv.writer(out_target)
        writer.writerow([
            "Bill Number",
            "Paid At",
            "Business Date",
            "Table",
            "Floor",
            "Waiter",
            "Payment Method",
            "Subtotal",
            "Tax",
            "Discount",
            "Total",
            "Amount Received",
            "Change Due",
            "Items Summary",
        ])

        for b in bills:
            active_items = [f"{it['name']} x{it['qty']}" for it in b["items"] if not it["voided"]]
            items_summary = "; ".join(active_items)
            writer.writerow([
                b["billNumber"] or b["orderId"],
                b["paidAt"],
                b["businessDate"],
                f"T{b['tableNumber']}" if b["tableNumber"] is not None else "",
                b["floorId"],
                b["waiter"],
                b["paymentMethod"],
                f"{b['subtotal']:.2f}" if b["subtotal"] is not None else "0.00",
                f"{b['tax']:.2f}" if b["tax"] is not None else "0.00",
                f"{b['discount']:.2f}" if b["discount"] is not None else "0.00",
                f"{b['total']:.2f}" if b["total"] is not None else "0.00",
                f"{b['amountReceived']:.2f}" if b["amountReceived"] is not None else "",
                f"{b['changeDue']:.2f}" if b["changeDue"] is not None else "",
                items_summary,
            ])

        if args.out:
            out_target.close()
            print(f"Exported {len(bills)} bills to {args.out} (UTF-8 BOM CSV)")


if __name__ == "__main__":
    main()
