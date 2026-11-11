#!/usr/bin/env python3
"""Database Restore CLI Tool.

Safely restores the POS database from a .db.gz backup archive.

Usage:
    python scripts/restore.py <backup_file> [--yes]
"""

import argparse
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
from app.services.backup import get_sqlite_path, restore_backup


def main():
    parser = argparse.ArgumentParser(description="Restore the POS database from backup")
    parser.add_argument("backup_file", help="Path to backup .db.gz file")
    parser.add_argument("--yes", "-y", action="store_true", help="Bypass interactive confirmation")
    args = parser.parse_args()

    # 1. Guard: Check if server is running
    if is_server_running():
        print("ERROR: Server is currently running. Stop the server before restoring.", file=sys.stderr)
        sys.exit(1)

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
        print(f"ERROR: Backup file '{args.backup_file}' not found.", file=sys.stderr)
        sys.exit(1)

    # 2. Confirmation prompt
    if not args.yes:
        print("\n" + "!" * 60)
        print("                        WARNING!")
        print("Restoring a backup will OVERWRITE the current active database.")
        print(f"Target Backup: {p.name}")
        print("A safety copy of the current database will be saved first.")
        print("!" * 60)
        confirm = input("\nType 'RESTORE' to proceed: ").strip()
        if confirm != "RESTORE":
            print("Restore aborted.")
            sys.exit(0)

    print(f"\nStarting restore from {p.name} ...")
    try:
        # Determine exact db target
        rel_path = get_sqlite_path(settings.DATABASE_URL)
        candidates = [Path(rel_path).resolve(), (PROJECT_ROOT / rel_path).resolve(), (BACKEND_DIR / rel_path).resolve()]
        db_path = next((str(c) for c in candidates if c.exists()), str(candidates[0]))

        res = restore_backup(str(p), safety_copy=True, db_path=db_path)
        print("\n" + "=" * 50)
        print("       DATABASE RESTORE COMPLETED SUCCESSFULLY")
        print("=" * 50)
        print(f"Restored From:   {res['restoredFrom']}")
        if res.get("safetyCopy"):
            print(f"Safety Copy:     {res['safetyCopy']}")
        print(f"Restored Orders: {res['ordersCount']}")
        print(f"Restored Bills:  {res['paidBillsCount']}")
        print(f"Restored Items:  {res['menuItemsCount']}")
        print("=" * 50)
        print("You can now safely restart the server.\n")
        sys.exit(0)
    except Exception as e:
        print(f"\nRestore FAILED: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

