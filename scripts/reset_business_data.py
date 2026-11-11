#!/usr/bin/env python3
"""Reset Business Data CLI Tool.

Safely purges business transaction data (orders, bills, print jobs, idempotency keys)
while preserving configuration (floors, tables, menu categories, menu items, printers, users).

Usage:
    python scripts/reset_business_data.py [--yes]
"""

import argparse
import sqlite3
import sys
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
from app.core.lock import is_server_running
from app.services import audit
from app.services.backup import create_backup, get_sqlite_path


def main():
    parser = argparse.ArgumentParser(description="Purge orders, bills, and transactions while keeping catalog config")
    parser.add_argument("--yes", "-y", action="store_true", help="Bypass confirmation prompt")
    args = parser.parse_args()

    # 1. Guard: Check if server is running
    if is_server_running():
        print("ERROR: Server is currently running. Stop the server before resetting business data.", file=sys.stderr)
        sys.exit(1)

    # 2. Confirmation prompt
    if not args.yes:
        print("\n" + "!" * 70)
        print("                         DANGER ZONE!")
        print("This script will PERMANENTLY DELETE all orders, order items, print jobs,")
        print("bills, idempotency keys, and daily sequences from the database.")
        print("Floors, tables, menu categories, menu items, printers, and users will be KEPT.")
        print("An automatic backup will be created immediately before deleting any data.")
        print("!" * 70)
        confirm = input("\nType 'DELETE ALL ORDERS' to proceed: ").strip()
        if confirm != "DELETE ALL ORDERS":
            print("Operation aborted.")
            sys.exit(0)

    # 3. Automatic pre-reset backup
    print("\nCreating safety pre-reset backup...")
    backup_res = create_backup(reason="pre-reset")
    if not backup_res.get("success"):
        print(f"ERROR: Safety backup failed: {backup_res.get('error')}. Aborting data reset.", file=sys.stderr)
        sys.exit(1)

    print(f"Safety backup created: {backup_res['filename']}")

    # 4. Resolve DB file
    rel_path = get_sqlite_path(settings.DATABASE_URL)
    candidates = [Path(rel_path).resolve(), (PROJECT_ROOT / rel_path).resolve(), (BACKEND_DIR / rel_path).resolve()]
    db_path = next((str(c) for c in candidates if c.exists()), str(candidates[0]))

    # 5. Execute reset in a single transaction
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    try:
        cur.execute("PRAGMA foreign_keys = OFF")  # Avoid ordering issues during bulk truncate
        cur.execute("BEGIN TRANSACTION")

        # Counts before
        cur.execute("SELECT COUNT(*) FROM orders")
        orders_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM order_items")
        items_count = cur.fetchone()[0]

        try:
            cur.execute("SELECT COUNT(*) FROM print_jobs")
            jobs_count = cur.fetchone()[0]
        except Exception:
            jobs_count = 0

        # Purge tables
        cur.execute("DELETE FROM order_items")
        cur.execute("DELETE FROM orders")
        try:
            cur.execute("DELETE FROM print_jobs")
        except Exception:
            pass
        try:
            cur.execute("DELETE FROM idempotency_keys")
        except Exception:
            pass
        try:
            cur.execute("DELETE FROM daily_sequences")
        except Exception:
            pass

        # Reset tables state
        cur.execute("UPDATE tables SET status = 'free', current_order_id = NULL")

        # Delete order-related audit logs but retain system records
        try:
            cur.execute("DELETE FROM audit_logs WHERE event LIKE 'order.%' OR event LIKE 'bill.%'")
        except Exception:
            pass

        conn.commit()
        cur.execute("PRAGMA foreign_keys = ON")

        # Checkpoint and Vacuum
        print("Reclaiming storage space with VACUUM...")
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.execute("VACUUM")
        conn.close()

        # Record audit log
        audit.record(
            event="business_data.reset",
            role="system",
            details={
                "deletedOrders": orders_count,
                "deletedOrderItems": items_count,
                "deletedPrintJobs": jobs_count,
                "safetyBackup": backup_res["filename"],
            },
        )

        print("\n" + "=" * 55)
        print("          BUSINESS DATA RESET COMPLETE")
        print("=" * 55)
        print(f"Deleted Orders:        {orders_count}")
        print(f"Deleted Order Items:   {items_count}")
        print(f"Deleted Print Jobs:    {jobs_count}")
        print("Tables Reset to Free:  All")
        print(f"Pre-Reset Backup:      {backup_res['filename']}")
        print("=" * 55)
        print("Database is clean and ready for new business operations.\n")
        sys.exit(0)

    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"\nERROR: Data reset failed and was rolled back: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

