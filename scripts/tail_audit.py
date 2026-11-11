#!/usr/bin/env python3
"""Audit Log Viewer CLI Tool.

Tail and query recent security and business audit trail entries.

Usage:
    python scripts/tail_audit.py [--lines 50] [--event order.void] [--user admin]
"""

import argparse
import json
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
from app.services.backup import get_sqlite_path


def main():
    parser = argparse.ArgumentParser(description="View recent audit log entries")
    parser.add_argument("--lines", "-n", type=int, default=30, help="Number of records to display (default: 30)")
    parser.add_argument("--event", "-e", help="Filter by event name (e.g. order.void, auth.login)")
    parser.add_argument("--user", "-u", help="Filter by username or user ID")
    parser.add_argument("--json", action="store_true", help="Output raw JSON records")
    args = parser.parse_args()

    rel_path = get_sqlite_path(settings.DATABASE_URL)
    candidates = [Path(rel_path).resolve(), (PROJECT_ROOT / rel_path).resolve(), (BACKEND_DIR / rel_path).resolve()]
    db_path = next((str(c) for c in candidates if c.exists()), str(candidates[0]))

    if not Path(db_path).exists():
        print(f"Error: Database file not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    conditions = []
    params = []

    if args.event:
        conditions.append("event LIKE ?")
        params.append(f"%{args.event}%")

    if args.user:
        conditions.append("user_id = ?")
        params.append(args.user)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT id, ts, event, user_id, role, entity, entity_id, request_id, details
        FROM audit_logs
        {where_clause}
        ORDER BY id DESC
        LIMIT ?
    """
    params.append(args.lines)

    try:
        cur.execute(query, params)
        rows = cur.fetchall()
    except Exception as e:
        print(f"Error querying audit_logs: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    if not rows:
        print("No audit log records found matching query.")
        return

    # Display in chronological order
    rows.reverse()

    if args.json:
        out = []
        for r in rows:
            out.append({
                "id": r[0],
                "ts": r[1],
                "event": r[2],
                "user_id": r[3],
                "role": r[4],
                "entity": r[5],
                "entity_id": r[6],
                "request_id": r[7],
                "details": json.loads(r[8]) if r[8] else {},
            })
        print(json.dumps(out, indent=2))
        return

    print("\n" + "=" * 90)
    print("                              AUDIT TRAIL LOGS")
    print("=" * 90)
    print(f"{'TIMESTAMP':<20} | {'EVENT':<24} | {'USER':<10} | {'ROLE':<8} | {'DETAILS'}")
    print("-" * 90)

    for r in rows:
        ts = str(r[1])[:19]
        event = r[2]
        user_id = r[3] or "-"
        role = r[4] or "-"
        raw_det = r[8]
        try:
            det_obj = json.loads(raw_det) if raw_det else {}
            # Flatten summary
            det_summary = ", ".join(f"{k}={v}" for k, v in list(det_obj.items())[:3])
            if len(det_obj) > 3:
                det_summary += ", ..."
        except Exception:
            det_summary = str(raw_det)[:40]

        print(f"{ts:<20} | {event:<24} | {user_id:<10} | {role:<8} | {det_summary}")

    print("-" * 90)
    print(f"Showing {len(rows)} entries.\n")


if __name__ == "__main__":
    main()

