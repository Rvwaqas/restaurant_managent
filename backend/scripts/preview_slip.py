#!/usr/bin/env python3
"""
CLI tool to preview slip layouts as monospace text or dump raw ESC/POS bytes.
Usage:
  python backend/scripts/preview_slip.py --sample kitchen --columns 48
  python backend/scripts/preview_slip.py --sample bill --columns 32
  python backend/scripts/preview_slip.py --job <job_id>
"""

import sys
import os
import json
import argparse

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings
from app.services.printing.renderers import render_slip
from app.services.printing.text_preview import to_text
from app.services.printing.escpos import to_escpos

SAMPLES = {
    "kitchen": {
        "v": 1,
        "kind": "kitchen",
        "orderId": "ord-preview01",
        "tableNumber": "5",
        "floorName": "Main Floor (Halal)",
        "waiterName": "Alice Waiter",
        "batchNo": 1,
        "categoryId": "cat-food",
        "categoryName": "Kitchen Station",
        "printerName": "Kitchen Printer 1",
        "items": [
            {"name": "Nasi Lemak Special Rendang", "qty": 2, "note": "Extra sambal on side"},
            {"name": "Roti Canai with Dhal Curry", "qty": 3, "note": ""},
            {"name": "Teh Tarik Ice", "qty": 1, "note": "Less sweet, more tea"},
        ],
    },
    "cancel": {
        "v": 1,
        "kind": "cancel",
        "orderId": "ord-preview01",
        "tableNumber": "5",
        "floorName": "Main Floor (Halal)",
        "categoryName": "Kitchen Station",
        "name": "Nasi Lemak Special Rendang",
        "qty": 1,
        "reason": "Customer cancelled / wrong table",
        "voidedBy": "Admin User",
    },
    "bill": {
        "v": 1,
        "kind": "bill",
        "billNo": "B-0042",
        "orderId": "ord-preview01",
        "tableNumber": "5",
        "floorName": "Main Floor (Halal)",
        "waiterName": "Alice Waiter",
        "paymentMethod": "cash",
        "subtotal": 1700.0,
        "discount": 100.0,
        "tax": 0.0,
        "serviceCharge": 0.0,
        "total": 1600.0,
        "amountReceived": 2000.0,
        "changeDue": 400.0,
        "items": [
            {"name": "Nasi Lemak Special Rendang", "qty": 2, "price": 600.0, "total": 1200.0},
            {"name": "Roti Canai with Dhal Curry", "qty": 3, "price": 100.0, "total": 300.0},
            {"name": "Teh Tarik Ice", "qty": 1, "price": 200.0, "total": 200.0},
        ],
    },
    "test": {
        "v": 1,
        "kind": "test",
        "printerName": "Cashier Main POS-58/80",
        "ip": "192.168.1.103",
        "port": 9100,
        "role": "cashier",
        "restaurantName": "Restaurant POS",
    },
}


def main():
    parser = argparse.ArgumentParser(description="Preview receipt slips in monospace ASCII")
    parser.add_argument("--sample", choices=["kitchen", "cancel", "bill", "test"], help="Sample slip kind to render")
    parser.add_argument("--job", help="Print job ID from the database")
    parser.add_argument("--columns", type=int, default=48, choices=[32, 42, 48], help="Slip column width (default 48)")
    parser.add_argument("--bin", help="Optional path to write raw ESC/POS bytes")

    args = parser.parse_args()

    if not args.sample and not args.job:
        parser.error("Either --sample or --job must be specified")

    payload = None
    kind = "kitchen"

    if args.job:
        from app.core.database import SessionLocal
        from app.models import PrintJob

        db = SessionLocal()
        try:
            job = db.query(PrintJob).filter(PrintJob.id == args.job).first()
            if not job:
                print(f"Error: PrintJob {args.job} not found in database", file=sys.stderr)
                sys.exit(1)
            payload = json.loads(job.payload or "{}")
            kind = job.kind
        finally:
            db.close()
    else:
        kind = args.sample
        payload = SAMPLES[args.sample]

    doc = render_slip(kind, payload, columns=args.columns)
    preview = to_text(doc, columns=args.columns)

    print("=" * args.columns)
    print(f"PREVIEW: Kind={kind} | Columns={args.columns}")
    print("=" * args.columns)
    print(preview)
    print("=" * args.columns)

    if args.bin:
        raw_bytes = to_escpos(doc, print_cut=True, cash_drawer_kick=False, columns=args.columns)
        with open(args.bin, "wb") as f:
            f.write(raw_bytes)
        print(f"Raw ESC/POS bytes written to: {args.bin} ({len(raw_bytes)} bytes)")


if __name__ == "__main__":
    main()

