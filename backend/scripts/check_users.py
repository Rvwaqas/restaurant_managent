#!/usr/bin/env python3
"""Validate Users YAML CLI Tool.

Inspects config/users.yaml for valid syntax, roles, floor assignments,
and verifies password hashes match the scrypt standard format without leaking secrets.

Usage:
    python scripts/check_users.py [path_to_users.yaml]
"""

import sys
import base64
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


def main():
    target_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not target_path:
        target_path = settings.USERS_CONFIG_PATH

    p = Path(target_path)
    if not p.is_absolute() and not p.exists():
        candidates = [PROJECT_ROOT / p, BACKEND_DIR / p, BACKEND_DIR / "config" / p.name]
        for c in candidates:
            if c.exists():
                p = c
                break

    if not p.exists():
        print(f"ERROR: Users configuration file not found at '{target_path}'", file=sys.stderr)
        sys.exit(1)

    print(f"\nChecking users config: {p.resolve()} ...\n")

    try:
        import yaml
        with open(p, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except Exception as e:
        print(f"ERROR: Failed to parse YAML file: {e}", file=sys.stderr)
        sys.exit(1)

    users = data.get("users", [])
    if not users:
        print("WARNING: No users defined in file.", file=sys.stderr)
        sys.exit(1)

    valid_roles = {"admin", "waiter", "cashier"}
    errors = 0

    print(f"{'USERNAME':<16} | {'ROLE':<10} | {'FLOORS':<15} | {'HASH FORMAT'}")
    print("-" * 65)

    for u in users:
        uname = u.get("username", "<missing>")
        role = u.get("role", "<missing>")
        floors = u.get("allowed_floors", [])
        pwd_hash = u.get("password_hash", "")

        status = "OK (scrypt)"
        if not uname or uname == "<missing>":
            status = "FAIL (missing username)"
            errors += 1
        elif role not in valid_roles:
            status = f"FAIL (invalid role '{role}')"
            errors += 1
        else:
            # Check scrypt format: scrypt$N$r$p$salt$hash
            parts = pwd_hash.split("$")
            if len(parts) != 6 or parts[0] != "scrypt":
                status = "FAIL (invalid scrypt format)"
                errors += 1
            else:
                try:
                    N = int(parts[1])
                    r = int(parts[2])
                    p_val = int(parts[3])
                    salt = base64.b64decode(parts[4])
                    h = base64.b64decode(parts[5])
                    if len(salt) != 16 or len(h) != 64:
                        status = "WARN (non-standard key/salt length)"
                except Exception as e:
                    status = f"FAIL (corrupted base64: {e})"
                    errors += 1

        floors_str = ", ".join(floors) if floors else "all"
        print(f"{uname:<16} | {role:<10} | {floors_str:<15} | {status}")

    print("-" * 65)
    if errors > 0:
        print(f"\nFAILED: {errors} issue(s) detected in users configuration.", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"\nSUCCESS: All {len(users)} user(s) verified valid.\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
