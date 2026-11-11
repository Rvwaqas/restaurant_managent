#!/usr/bin/env python3
"""List Backups CLI Tool.

Lists all available backups with timestamps, size, reason, and sidecar status.

Usage:
    python scripts/list_backups.py
"""

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

from app.services.backup import list_backups


def main():
    backups = list_backups()
    if not backups:
        print("No backups found in backup directory.")
        return

    print("\n" + "=" * 80)
    print("                     AVAILABLE DATABASE BACKUPS")
    print("=" * 80)
    print(f"{'FILENAME':<38} | {'REASON':<15} | {'SIZE':<8} | {'AGE':<7} | {'SIDECAR'}")
    print("-" * 80)

    for b in backups:
        fn = b.get("filename", "")
        reason = b.get("reason", "unknown")
        size_mb = b.get("size_mb", 0)
        age_hours = b.get("age_hours", 0)
        sidecar = "OK" if b.get("sidecar_exists") else "MISSING"

        if age_hours < 24:
            age_str = f"{age_hours:.1f}h"
        else:
            age_str = f"{age_hours / 24:.1f}d"

        print(f"{fn:<38} | {reason:<15} | {size_mb:>6.2f}MB | {age_str:>7} | {sidecar}")

    print("-" * 80)
    print(f"Total backups: {len(backups)}\n")


if __name__ == "__main__":
    main()

