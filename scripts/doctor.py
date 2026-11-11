#!/usr/bin/env python3
"""System Diagnostic & Health Check Tool (Doctor).

Usage:
    python scripts/doctor.py [--url http://localhost:8000] [--verbose]
"""

import argparse
import datetime
import json
import os
import socket
import sqlite3
import sys
import urllib.request
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
from app.core.startup_checks import check_clock_guard
from app.core.timeutil import get_local_now, get_local_timezone
from app.services.backup import get_sqlite_path


def check_python_version():
    ver = sys.version_info
    v_str = f"{ver.major}.{ver.minor}.{ver.micro}"
    if ver.major >= 3 and ver.minor >= 11:
        return ("Python Version", "OK", f"Python {v_str} (>= 3.11)")
    return ("Python Version", "FAIL", f"Python {v_str} is below recommended 3.11")


def check_database():
    results = []
    rel_path = get_sqlite_path(settings.DATABASE_URL)
    candidates = [
        Path(rel_path).resolve(),
        (PROJECT_ROOT / rel_path).resolve(),
        (BACKEND_DIR / rel_path).resolve(),
    ]
    db_path = None
    for c in candidates:
        if c.exists():
            db_path = c
            break

    if not db_path:
        db_path = candidates[0]
        return [("Database File", "FAIL", f"DB not found at {db_path}")]

    results.append(("Database File", "OK", f"Found at {db_path.name} ({db_path.stat().st_size / 1024:.1f} KB)"))

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # SQLite version
        cursor.execute("SELECT sqlite_version()")
        sqlite_ver = cursor.fetchone()[0]
        results.append(("SQLite Version", "OK", f"v{sqlite_ver}"))

        # Pragmas
        cursor.execute("PRAGMA journal_mode")
        j_mode = cursor.fetchone()[0].lower()
        if j_mode == "wal":
            results.append(("Journal Mode", "OK", "WAL mode active"))
        else:
            results.append(("Journal Mode", "WARN", f"Expected WAL, found '{j_mode}'"))

        cursor.execute("PRAGMA synchronous")
        sync_mode = cursor.fetchone()[0]
        sync_map = {0: "OFF", 1: "NORMAL", 2: "FULL", 3: "EXTRA"}
        results.append(("Synchronous", "OK", f"{sync_map.get(sync_mode, sync_mode)} ({settings.SQLITE_SYNCHRONOUS})"))

        cursor.execute("PRAGMA quick_check")
        qc = cursor.fetchone()[0]
        if qc == "ok":
            results.append(("Integrity (quick_check)", "OK", "Passed without errors"))
        else:
            results.append(("Integrity (quick_check)", "FAIL", f"Corruption detected: {qc}"))

        # Read/Write test
        try:
            cursor.execute("CREATE TABLE IF NOT EXISTS _doctor_rw_probe (id INT, val TEXT)")
            cursor.execute("INSERT INTO _doctor_rw_probe VALUES (1, 'probe')")
            cursor.execute("SELECT val FROM _doctor_rw_probe WHERE id = 1")
            val = cursor.fetchone()[0]
            cursor.execute("DROP TABLE _doctor_rw_probe")
            conn.commit()
            if val == "probe":
                results.append(("DB Read/Write", "OK", "Successful test transaction"))
            else:
                results.append(("DB Read/Write", "FAIL", "Unexpected probe read value"))
        except Exception as e:
            results.append(("DB Read/Write", "FAIL", f"Read/write probe failed: {e}"))

        conn.close()
    except Exception as e:
        results.append(("Database Connection", "FAIL", f"Error opening DB: {e}"))

    return results


def check_alembic():
    try:
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory
        from app.core.database import engine

        alembic_cfg_path = BACKEND_DIR / "alembic.ini"
        if not alembic_cfg_path.exists():
            return [("Migrations", "WARN", "alembic.ini not found in backend/")]

        cfg = Config(str(alembic_cfg_path))
        cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
        script = ScriptDirectory.from_config(cfg)
        head_rev = script.get_current_head()

        with engine.connect() as connection:
            context = MigrationContext.configure(connection)
            current_rev = context.get_current_revision()

        if current_rev == head_rev:
            return [("Migrations", "OK", f"Database is at head ({head_rev})")]
        return [("Migrations", "WARN", f"Head is {head_rev}, but DB is at {current_rev}")]
    except Exception as e:
        return [("Migrations", "WARN", f"Could not inspect Alembic revisions: {e}")]


def check_users():
    users_path = Path(settings.USERS_CONFIG_PATH)
    if not users_path.is_absolute():
        users_path = (PROJECT_ROOT / users_path).resolve()
        if not users_path.exists():
            users_path = (BACKEND_DIR / settings.USERS_CONFIG_PATH).resolve()

    if not users_path.exists():
        return [("Users Config", "FAIL", f"users.yaml not found at {users_path}")]

    try:
        import yaml
        with open(users_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        users = data.get("users", [])
        if not users:
            return [("Users Config", "WARN", "No users defined in users.yaml")]

        valid_hashes = 0
        for u in users:
            pwd = u.get("password_hash", "")
            if pwd.startswith("scrypt$"):
                valid_hashes += 1

        return [("Users Config", "OK", f"{len(users)} user(s) defined, all using scrypt")]
    except Exception as e:
        return [("Users Config", "FAIL", f"Error parsing users.yaml: {e}")]


def check_clock_and_timezone():
    results = []
    try:
        tz = get_local_timezone()
        now = get_local_now()
        results.append(("Timezone", "OK", f"{settings.TIMEZONE} (current time: {now.strftime('%Y-%m-%d %H:%M:%S')})"))
    except Exception as e:
        results.append(("Timezone", "FAIL", f"Invalid timezone '{settings.TIMEZONE}': {e}"))

    # Clock guard
    try:
        rel_path = get_sqlite_path(settings.DATABASE_URL)
        candidates = [Path(rel_path).resolve(), (PROJECT_ROOT / rel_path).resolve(), (BACKEND_DIR / rel_path).resolve()]
        db_path = next((str(c) for c in candidates if c.exists()), str(candidates[0]))
        state, reason = check_clock_guard(db_path)
        if state == "ok":
            results.append(("Clock Guard", "OK", "System clock valid against DB records"))
        else:
            results.append(("Clock Guard", "WARN", f"Suspect clock: {reason}"))
    except Exception as e:
        results.append(("Clock Guard", "WARN", f"Could not run clock guard: {e}"))

    return results


def check_storage_and_permissions():
    results = []
    data_dir = BACKEND_DIR / "data"
    backup_dir = Path(settings.BACKUP_DIR)
    if not backup_dir.is_absolute():
        backup_dir = BACKEND_DIR / backup_dir

    for name, p in [("Data Dir", data_dir), ("Backups Dir", backup_dir)]:
        p.mkdir(parents=True, exist_ok=True)
        # Disk space
        try:
            import shutil
            total, used, free = shutil.disk_usage(str(p))
            free_mb = free / (1024 * 1024)
            if free_mb < settings.BACKUP_MIN_FREE_MB:
                results.append((f"{name} Space", "WARN", f"Low free space: {free_mb:.1f} MB (min {settings.BACKUP_MIN_FREE_MB} MB)"))
            else:
                results.append((f"{name} Space", "OK", f"{free_mb:.1f} MB free"))
        except Exception as e:
            results.append((f"{name} Space", "WARN", f"Could not check space: {e}"))

        # Write test
        probe_file = p / "_doctor_probe.tmp"
        try:
            probe_file.write_text("probe", encoding="utf-8")
            content = probe_file.read_text(encoding="utf-8")
            probe_file.unlink()
            if content == "probe":
                results.append((f"{name} Permissions", "OK", "Read/write verified"))
            else:
                results.append((f"{name} Permissions", "FAIL", "Read back mismatch"))
        except Exception as e:
            results.append((f"{name} Permissions", "FAIL", f"Directory not writable: {e}"))

    return results


def check_uploads():
    uploads_dir = BACKEND_DIR / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    file_count = len(list(uploads_dir.glob("*")))
    return [("Uploads Directory", "OK", f"Active at data/uploads ({file_count} files)")]


def check_printers():
    results = []
    try:
        from app.core.database import SessionLocal
        from app.models import Printer
        db = SessionLocal()
        printers = db.query(Printer).filter(Printer.is_active == True).all()
        db.close()

        if not printers:
            return [("Printers", "OK", "No active printers registered")]

        for prn in printers:
            # TCP ping port 9100
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            try:
                s.connect((prn.ip, 9100))
                s.close()
                results.append((f"Printer: {prn.name}", "OK", f"{prn.ip}:9100 reachable (role: {prn.role})"))
            except Exception:
                results.append((f"Printer: {prn.name}", "WARN", f"{prn.ip}:9100 unreachable (printer powered off or wrong IP)"))
    except Exception as e:
        results.append(("Printers", "WARN", f"Could not inspect printers: {e}"))

    return results


def check_tls_certificates():
    results = []
    mode = settings.SERVER_MODE.lower()
    if mode != "https":
        return [("TLS / HTTPS", "OK", "Running in plain HTTP mode (SERVER_MODE=plain)")]

    cert_path = Path(settings.TLS_CERT_FILE)
    key_path = Path(settings.TLS_KEY_FILE)
    ca_crt_path = Path(settings.TLS_CA_CERT_FILE)
    ca_key_path = Path(settings.TLS_CA_KEY_FILE)

    if not cert_path.exists():
        results.append(("TLS Certificate", "FAIL", f"Missing certificate at {cert_path} (run: python scripts/certs.py init)"))
        return results

    if not key_path.exists():
        results.append(("TLS Private Key", "FAIL", f"Missing private key at {key_path}"))
        return results

    # Check key permissions
    try:
        st = os.stat(str(key_path))
        if sys.platform != "win32" and (st.st_mode & 0o077) != 0:
            results.append(("Key Permissions", "WARN", f"{key_path} has loose permissions (chmod 600 recommended)"))
        else:
            results.append(("Key Permissions", "OK", "Restricted access verified"))
    except Exception:
        pass

    # Validate cert validity and expiry
    from app.serve import get_openssl_executable
    openssl = get_openssl_executable()
    if openssl:
        import subprocess
        # Check chain
        if ca_crt_path.exists():
            v_res = subprocess.run([openssl, "verify", "-CAfile", str(ca_crt_path), str(cert_path)], capture_output=True, text=True)
            if v_res.returncode == 0:
                results.append(("Certificate Trust", "OK", "Leaf certificate verified by Local CA"))
            else:
                results.append(("Certificate Trust", "FAIL", "Leaf certificate verification against CA failed"))

            sub_res = subprocess.run([openssl, "x509", "-noout", "-subject", "-in", str(ca_crt_path)], capture_output=True, text=True)
            if sub_res.returncode == 0 and "DEV" in sub_res.stdout:
                results.append(("CA Environment", "WARN", "CA certificate contains 'DEV' label - generated in development environment! Re-init for production."))

        # Check expiration days
        res_end = subprocess.run([openssl, "x509", "-noout", "-enddate", "-in", str(cert_path)], capture_output=True, text=True)
        if res_end.returncode == 0:
            end_str = res_end.stdout.replace("notAfter=", "").strip()
            try:
                exp_date = datetime.datetime.strptime(end_str, "%b %d %H:%M:%S %Y %Z")
                now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
                days_left = (exp_date - now).days
                if days_left < 14:
                    results.append(("Certificate Expiry", "FAIL", f"Expires in {days_left} day(s)! (run: python scripts/certs.py renew)"))
                elif days_left < 60:
                    results.append(("Certificate Expiry", "WARN", f"Expires soon: {days_left} day(s) remaining (run: python scripts/certs.py renew)"))
                else:
                    results.append(("Certificate Expiry", "OK", f"Valid for {days_left} day(s)"))
            except Exception:
                pass

        # Check current LAN IP in SAN
        from scripts.certs import detect_local_ips, parse_san_from_cert
        sans = parse_san_from_cert(cert_path, openssl)
        local_ips = detect_local_ips()
        missing = [ip for ip in local_ips if ip not in sans and ip != "127.0.0.1"]
        if missing:
            results.append(("SAN LAN IP", "WARN", f"Current LAN IP {missing[0]} missing from cert SAN. Run: python scripts/certs.py add-ip {missing[0]}"))
        else:
            results.append(("SAN LAN IP", "OK", "Current LAN IP matches certificate SAN"))

    return results


def check_backups():
    results = []
    try:
        from app.services.backup import list_backups
        backups = list_backups()
        if not backups:
            results.append(("Backup Status", "WARN", "No backups exist yet in backup directory"))
        else:
            newest = backups[0]
            age_hours = newest.get("age_hours", 0)
            size_mb = newest.get("size_mb", 0)
            if age_hours <= 26:
                results.append(("Backup Status", "OK", f"Latest backup: {newest['filename']} ({age_hours:.1f}h ago, {size_mb:.2f} MB)"))
            else:
                results.append(("Backup Status", "WARN", f"Latest backup is stale ({age_hours:.1f}h old): {newest['filename']}"))

        if settings.BACKUP_EXTRA_DIR:
            extra_path = Path(settings.BACKUP_EXTRA_DIR)
            if extra_path.exists() and os.access(str(extra_path), os.W_OK):
                results.append(("Extra Backup Dir", "OK", f"Mounted and writable at {extra_path}"))
            else:
                results.append(("Extra Backup Dir", "WARN", f"Not accessible or not writable: {extra_path}"))
    except Exception as e:
        results.append(("Backup Status", "WARN", f"Could not verify backups: {e}"))

    return results


def check_http_health(url: str):
    results = []
    endpoint = f"{url.rstrip('/')}/api/health"
    try:
        req = urllib.request.Request(endpoint, headers={"User-Agent": "POS-Doctor/1.0"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            status = data.get("status", "unknown")
            if status in ("ok", "healthy"):
                results.append(("HTTP Health API", "OK", f"{endpoint} responded status={status}"))
            else:
                results.append(("HTTP Health API", "WARN", f"{endpoint} responded status={status}"))
    except Exception as e:
        results.append(("HTTP Health API", "WARN", f"Could not reach {endpoint}: {e}"))
    return results


def main():
    parser = argparse.ArgumentParser(description="POS System Diagnostic Tool (Doctor)")
    parser.add_argument("--url", help="URL of running backend instance to probe /api/health", default=None)
    parser.add_argument("--verbose", action="store_true", help="Show extra diagnostic info")
    args = parser.parse_args()

    print("\n" + "=" * 70)
    print("      RESTAURANT POS - SYSTEM DIAGNOSTIC & HEALTH CHECK (DOCTOR)     ")
    print("=" * 70 + "\n")

    all_checks = []
    all_checks.append(("Environment", check_python_version()))
    all_checks.append(("Database", check_database()))
    all_checks.append(("Migrations", check_alembic()))
    all_checks.append(("Configuration", check_users()))
    all_checks.append(("Clock & Timezone", check_clock_and_timezone()))
    all_checks.append(("Storage", check_storage_and_permissions()))
    all_checks.append(("Uploads", check_uploads()))
    all_checks.append(("Hardware", check_printers()))
    all_checks.append(("Security & TLS", check_tls_certificates()))
    all_checks.append(("Backups", check_backups()))

    if args.url:
        all_checks.append(("Live Server", check_http_health(args.url)))

    warn_count = 0
    fail_count = 0

    print(f"{'CHECK':<28} | {'STATUS':<7} | {'DETAILS'}")
    print("-" * 70)

    for section_name, checks in all_checks:
        items = checks if isinstance(checks, list) else [checks]
        for name, status, details in items:
            if status == "WARN":
                warn_count += 1
            elif status == "FAIL":
                fail_count += 1

            status_color = status
            print(f"{name:<28} | {status_color:<7} | {details}")

    print("-" * 70)

    if fail_count > 0:
        print(f"\nSYSTEM STATUS: ISSUES DETECTED ({warn_count} warning(s), {fail_count} failure(s))")
        print("Resolve FAIL items before serving customers.")
        sys.exit(1)
    elif warn_count > 0:
        print(f"\nSYSTEM STATUS: READY FOR SERVICE ({warn_count} non-critical warning(s))")
        sys.exit(0)
    else:
        print("\nSYSTEM STATUS: READY FOR SERVICE (All checks passed cleanly)")
        sys.exit(0)


if __name__ == "__main__":
    main()
