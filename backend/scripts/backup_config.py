#!/usr/bin/env python3
"""Config & Certificate Backup Tool.

Backs up sensitive environment settings, users.yaml, and TLS certificates (including CA key)
into an encrypted/restricted tar.gz archive.

Usage:
    python scripts/backup_config.py [--extra-dir <dir>]
"""

import os
import sys
import tarfile
import datetime
import shutil
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
from app.services import audit


from typing import Optional


def create_config_backup(extra_dir: Optional[str] = None) -> Path:
    """Creates a timestamped tar.gz archive of config and certs."""
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = Path(settings.BACKUP_DIR)
    if not backup_dir.is_absolute():
        backup_dir = (PROJECT_ROOT / backup_dir).resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)

    archive_name = f"pos-config-{ts}.tar.gz"
    archive_path = backup_dir / archive_name

    items_to_pack = []

    # 1. Config files
    env_candidates = [
        PROJECT_ROOT / "config" / ".env",
        BACKEND_DIR / "config" / ".env",
        PROJECT_ROOT / ".env",
        BACKEND_DIR / ".env",
    ]
    for env in env_candidates:
        if env.exists():
            items_to_pack.append((env, "config/.env"))
            break

    users_candidates = [
        PROJECT_ROOT / "config" / "users.yaml",
        BACKEND_DIR / "config" / "users.yaml",
        Path(settings.USERS_CONFIG_PATH),
    ]
    for uc in users_candidates:
        if uc.exists():
            items_to_pack.append((uc, "config/users.yaml"))
            break

    # 2. Certs directory
    certs_candidates = [
        PROJECT_ROOT / "certs",
        BACKEND_DIR / "certs",
        Path("certs"),
    ]
    certs_dir = None
    for cd in certs_candidates:
        if cd.exists():
            certs_dir = cd
            break

    if certs_dir:
        for f in certs_dir.glob("*"):
            if f.is_file() and not f.name.endswith(".tmp"):
                items_to_pack.append((f, f"certs/{f.name}"))

    # Write tar.gz
    with tarfile.open(archive_path, "w:gz") as tar:
        for src_path, arcname in items_to_pack:
            tar.add(str(src_path), arcname=arcname)

    # Set 0600 on archive
    try:
        os.chmod(str(archive_path), 0o600)
    except Exception:
        pass

    # Copy to extra dir if specified or in settings
    dest_extra = extra_dir or settings.BACKUP_EXTRA_DIR
    extra_copy_path = None
    if dest_extra and os.path.exists(dest_extra):
        try:
            extra_target = Path(dest_extra) / archive_name
            shutil.copyfile(archive_path, extra_target)
            extra_copy_path = str(extra_target)
        except Exception as e:
            print(f"Warning: Could not copy config backup to extra dir: {e}", file=sys.stderr)

    # Audit record
    audit.record(
        event="backup.config_created",
        role="system",
        details={
            "archive": archive_name,
            "itemsCount": len(items_to_pack),
            "sizeBytes": archive_path.stat().st_size,
            "extraDirCopy": extra_copy_path,
        },
    )

    return archive_path


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Create a sensitive config and certificate backup archive")
    parser.add_argument("--extra-dir", help="Secondary backup destination directory")
    args = parser.parse_args()

    print("Creating configuration and certificate backup archive...")
    archive = create_config_backup(extra_dir=args.extra_dir)

    print("\n" + "=" * 65)
    print("           CONFIG & CERTIFICATE BACKUP COMPLETED")
    print("=" * 65)
    print(f"Archive File:  {archive.name}")
    print(f"Location:      {archive}")
    print(f"Size:          {archive.stat().st_size / 1024:.2f} KB")
    print(f"Permissions:   Restricted (0600)")
    print("-" * 65)
    print("IMPORTANT SECURITY NOTICE:")
    print("This archive contains your private Root CA key (ca.key) and secrets.")
    print("Store a copy on a secure offline USB drive in case of tablet loss.\n")


if __name__ == "__main__":
    main()
