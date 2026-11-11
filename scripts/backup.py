#!/usr/bin/env python3
"""Manual Database Backup CLI Tool.

Usage:
    python scripts/backup.py [--reason manual]
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

from app.services.backup import create_backup


def main():
    parser = argparse.ArgumentParser(description="Create an online database backup")
    parser.add_argument("--reason", default="manual", help="Reason for backup (e.g. manual, pre-upgrade, pre-maintenance)")
    args = parser.parse_args()

    print(f"Starting online SQLite backup (reason: {args.reason})...")
    res = create_backup(reason=args.reason)

    if res.get("success"):
        size_bytes = res.get("sizeBytes", 0)
        size_mb = size_bytes / (1024 * 1024)
        print("\nBackup completed successfully!")
        print(f"  File:       {res.get('filename')}")
        print(f"  Path:       {res.get('filepath')}")
        print(f"  Size:       {size_mb:.2f} MB ({size_bytes} bytes)")
        print(f"  SHA256:     {res.get('sha256')}")
        print(f"  Sidecar:    {res.get('filepath')}.sha256")
        if res.get("extraCopyOk"):
            print("  Extra Copy: Verified")
        print(f"  Duration:   {res.get('durationSec', 0):.2f}s")
        sys.exit(0)
    else:
        print(f"\nBackup failed: {res.get('error', 'Unknown error')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
