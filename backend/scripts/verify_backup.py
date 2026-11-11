#!/usr/bin/env python3
"""Backup Verification CLI Tool.

Verifies SHA-256 sidecar checksum, decompresses, checks SQLite integrity & foreign keys,
and summarizes database statistics.

Usage:
    python scripts/verify_backup.py <backup_file_or_path>
"""

import sys
import argparse
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
from app.services.backup import verify_backup_file


def main():
    parser = argparse.ArgumentParser(description="Verify SQLite POS backup integrity and contents")
    parser.add_argument("backup_file", help="Path to backup .db.gz file")
    args = parser.parse_args()

    p = Path(args.backup_file)
    if not p.is_absolute() and not p.exists():
        candidates = [
            PROJECT_ROOT / p,
            BACKEND_DIR / p,
            PROJECT_ROOT / "data" / "backups" / p.name,
            BACKEND_DIR / "data" / "backups" / p.name,
            Path(settings.BACKUP_DIR) / p.name,
        ]
        for c in candidates:
            if c.exists():
                p = c
                break

    if not p.exists():
        print(f"Error: Backup file not found at '{args.backup_file}'", file=sys.stderr)
        sys.exit(1)

    print(f"Verifying backup: {p.name} ...")
    try:
        res = verify_backup_file(str(p))
    except Exception as e:
        print(f"\nVerification FAILED: {e}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 50)
    print("       BACKUP VERIFICATION REPORT")
    print("=" * 50)
    print(f"File:             {p.name}")
    print(f"Size:             {res['sizeBytes'] / (1024 * 1024):.2f} MB ({res['sizeBytes']} bytes)")
    print(f"Integrity Check:  PASSED (PRAGMA integrity_check == ok)")
    print(f"Foreign Keys:     PASSED (PRAGMA foreign_key_check == ok)")
    sidecar_txt = "PASSED (matches .sha256 sidecar)" if res.get("sidecarVerified") else "No sidecar file"
    print(f"Checksum:         {res['sha256']}")
    print(f"Sidecar Check:    {sidecar_txt}")
    print("-" * 50)
    print("Database Contents:")
    print(f"  Total Orders:   {res['ordersCount']}")
    print(f"  Paid Bills:     {res['paidBillsCount']}")
    print(f"  Menu Items:     {res['menuItemsCount']}")
    print(f"  Oldest Order:   {res.get('orderDateMin') or 'N/A'}")
    print(f"  Newest Order:   {res.get('orderDateMax') or 'N/A'}")
    print("=" * 50)
    print("RESULT: VALID AND RESTORABLE")
    sys.exit(0)


if __name__ == "__main__":
    main()
