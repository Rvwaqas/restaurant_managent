import datetime
import logging
import os
import shutil
import sqlite3
import sys
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.timeutil import get_local_timezone
from app.services import audit

logger = logging.getLogger("pos.startup")

# Global health indicators
clock_state: str = "ok"  # "ok" | "suspect"
startup_warnings: List[str] = []
last_integrity_check: Dict[str, Any] = {"at": None, "result": "ok"}
last_request_timestamp: float = 0.0


def record_request_activity():
    """Tracks timestamp of recent requests to ensure VACUUM only runs when idle."""
    global last_request_timestamp
    import time
    last_request_timestamp = time.monotonic()


def get_current_time_for_clock_guard() -> datetime.datetime:
    """Returns now or CLOCK_OVERRIDE if configured for testing."""
    if settings.CLOCK_OVERRIDE:
        try:
            return datetime.datetime.fromisoformat(settings.CLOCK_OVERRIDE)
        except Exception:
            pass
    return datetime.datetime.now(datetime.timezone.utc)


def check_clock_guard(db_path: str) -> Tuple[str, Optional[str]]:
    """
    Clock Guard:
    Compares current wall-clock time with:
    1. The BUILD_DATE floor date (2026-01-01).
    2. The newest created_at / paid_at / audit timestamp in the database.
    If now is > 5 minutes before newest DB timestamp, or before BUILD_DATE,
    the clock is deemed suspect.
    """
    global clock_state
    now_utc = get_current_time_for_clock_guard()
    now_naive = now_utc.replace(tzinfo=None) if now_utc.tzinfo else now_utc

    # 1. Check against BUILD_DATE floor
    try:
        build_floor = datetime.datetime.strptime(settings.BUILD_DATE, "%Y-%m-%d")
        if now_naive < build_floor:
            clock_state = "suspect"
            msg = f"System clock looks wrong: current time {now_naive} is before build date {build_floor}"
            logger.critical(msg)
            return "suspect", msg
    except Exception as e:
        logger.warning("Error comparing build date: %s", e)

    # 2. Check against newest database timestamp
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path, timeout=5.0)
            cur = conn.cursor()
            newest_ts = None

            # Check orders
            try:
                cur.execute("SELECT MAX(created_at) FROM orders")
                r = cur.fetchone()
                if r and r[0]:
                    newest_ts = r[0]
            except Exception:
                pass

            # Check audit_logs
            try:
                cur.execute("SELECT MAX(ts) FROM audit_logs")
                r = cur.fetchone()
                if r and r[0] and (not newest_ts or r[0] > newest_ts):
                    newest_ts = r[0]
            except Exception:
                pass

            conn.close()

            if newest_ts:
                if isinstance(newest_ts, str):
                    dt_newest = datetime.datetime.fromisoformat(newest_ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    dt_newest = newest_ts

                # If current time is more than 5 minutes in the past relative to newest DB timestamp
                if now_naive < (dt_newest - datetime.timedelta(minutes=5)):
                    clock_state = "suspect"
                    msg = (
                        f"System clock looks wrong: set the correct date/time on the server tablet "
                        f"(current={now_naive}, newest_db_record={dt_newest})"
                    )
                    logger.critical(msg)
                    return "suspect", msg

        except Exception as e:
            logger.warning("Error reading newest timestamp for clock guard: %s", e)

    clock_state = "ok"
    return "ok", None


def run_startup_checks(db_path: str) -> None:
    """
    Executes mandatory startup validation and health audits:
    - Halts on FAIL conditions with a descriptive error.
    - Collects WARN conditions into startup_warnings and health reports.
    """
    global startup_warnings
    startup_warnings.clear()

    # -------------------------------------------------------------
    # FAIL CHECKS (Must refuse to start)
    # -------------------------------------------------------------

    # FAIL 1: Timezone Data
    try:
        get_local_timezone()
    except Exception as e:
        raise RuntimeError(f"STARTUP FAILED: Timezone data for '{settings.TIMEZONE}' cannot be loaded: {e}")

    # FAIL 2: Production Secrets & Example Hashes
    if settings.APP_ENV == "prod":
        if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 32 or "change-in-production" in settings.SECRET_KEY:
            raise RuntimeError(
                "STARTUP FAILED: Production mode requires a secure SECRET_KEY with at least 32 characters. "
                "Generate one using 'python scripts/gen_secret.py'."
            )
        # Check users file for example hashes
        from app.api.endpoints.auth import load_staff_users
        users = load_staff_users()
        for u in users:
            ph = u.get("password_hash", "")
            if "WDjQsJ4niqdaF7r0gpqSSAqpILNH0fW94mASjnDk+AxoPLbGPFdX57dWR6byLHlliwO59S4dY1CZmrqUMn9r5A==" in ph:
                raise RuntimeError(
                    "STARTUP FAILED: Production mode detected example default password hash for admin user. "
                    "Change passwords using 'python scripts/hash_password.py <password>' before starting."
                )

    # FAIL 3: Directory Writability
    for dir_path in (settings.UPLOAD_DIR, settings.LOG_DIR, settings.BACKUP_DIR):
        try:
            os.makedirs(dir_path, exist_ok=True)
            test_file = os.path.join(dir_path, ".write_test")
            with open(test_file, "w") as f:
                f.write("ok")
            os.remove(test_file)
        except Exception as e:
            raise RuntimeError(f"STARTUP FAILED: Directory '{dir_path}' is not writable: {e}")

    # FAIL 4: SQLite PRAGMA quick_check
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path, timeout=10.0)
            cur = conn.cursor()
            cur.execute("PRAGMA quick_check")
            rows = cur.fetchall()
            conn.close()
            if not rows or rows[0][0].lower() != "ok":
                from app.services.backup import list_backups
                backups = list_backups()
                newest_file = backups[0]["filepath"] if backups else "<none>"
                raise RuntimeError(
                    f"STARTUP FAILED: Database corruption detected (PRAGMA quick_check failed: {rows}).\n"
                    f"Newest valid backup: {newest_file}\n"
                    f"To restore, run: python scripts/restore.py {newest_file} --yes"
                )
        except sqlite3.DatabaseError as e:
            from app.services.backup import list_backups
            backups = list_backups()
            newest_file = backups[0]["filepath"] if backups else "<none>"
            raise RuntimeError(
                f"STARTUP FAILED: Database corruption detected ({e}).\n"
                f"Newest valid backup: {newest_file}\n"
                f"To restore, run: python scripts/restore.py {newest_file} --yes"
            )

    # -------------------------------------------------------------
    # WARN CHECKS (Logs warning and surfaces in GET /api/health)
    # -------------------------------------------------------------

    # WARN 1: Free Disk Space
    try:
        _, _, free_bytes = shutil.disk_usage(os.path.dirname(os.path.abspath(db_path)) or ".")
        free_mb = free_bytes / (1024.0 * 1024.0)
        total_bytes, _, _ = shutil.disk_usage(os.path.dirname(os.path.abspath(db_path)) or ".")
        free_pct = (free_bytes / total_bytes) * 100.0 if total_bytes > 0 else 100.0

        if free_mb < float(settings.BACKUP_MIN_FREE_MB) or free_pct < 5.0:
            warn = f"Low disk space: {free_mb:.1f} MB free ({free_pct:.1f}% remaining)"
            logger.warning(warn)
            startup_warnings.append(warn)
    except Exception as e:
        logger.debug("Could not verify disk space: %s", e)

    # WARN 2: File Permissions on POSIX
    if sys.platform != "win32":
        for sensitive_file in (settings.USERS_CONFIG_PATH, ".env"):
            if os.path.exists(sensitive_file):
                try:
                    mode = os.stat(sensitive_file).st_mode
                    if mode & 0o044:  # Group or others readable
                        warn = f"Sensitive file '{sensitive_file}' has loose permissions ({oct(mode)[-3:]}); recommend chmod 600"
                        logger.warning(warn)
                        startup_warnings.append(warn)
                except Exception:
                    pass

    # WARN 3: SQLite Version
    try:
        sqlite_ver = sqlite3.sqlite_version_info
        if sqlite_ver < (3, 25, 0):
            warn = f"SQLite version {sqlite3.sqlite_version} is older than 3.25.0 (window functions not supported)"
            logger.warning(warn)
            startup_warnings.append(warn)
    except Exception:
        pass

    # WARN 4: Cashier Printer Availability
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path, timeout=5.0)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM printers WHERE role = 'cashier' AND is_active = 1")
            active_cashier_count = cur.fetchone()[0]
            conn.close()
            if active_cashier_count == 0:
                warn = "No active cashier printer configured in database"
                logger.warning(warn)
                startup_warnings.append(warn)
        except Exception:
            pass

    # WARN 5: Backup Freshness (> 26 hours old)
    from app.services.backup import list_backups
    backups = list_backups()
    if not backups:
        warn = "No database backups found"
        logger.warning(warn)
        startup_warnings.append(warn)
    elif backups[0]["age_hours"] > 26.0:
        warn = f"Latest database backup is stale ({backups[0]['age_hours']} hours old)"
        logger.warning(warn)
        startup_warnings.append(warn)

    # WARN 6: BACKUP_EXTRA_DIR Accessibility
    if settings.BACKUP_EXTRA_DIR:
        try:
            os.makedirs(settings.BACKUP_EXTRA_DIR, exist_ok=True)
            chk_file = os.path.join(settings.BACKUP_EXTRA_DIR, ".write_chk")
            with open(chk_file, "w") as f:
                f.write("ok")
            os.remove(chk_file)
        except Exception as e:
            warn = f"BACKUP_EXTRA_DIR '{settings.BACKUP_EXTRA_DIR}' is not writable: {e}"
            logger.warning(warn)
            startup_warnings.append(warn)

    # WARN 7: Default Demo Data in Production
    if settings.APP_ENV == "prod" and os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path, timeout=5.0)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM orders WHERE is_demo = 1")
            demo_count = cur.fetchone()[0]
            conn.close()
            if demo_count > 0:
                warn = f"Production database contains {demo_count} demo order records; run 'python scripts/reset_business_data.py' before service"
                logger.warning(warn)
                startup_warnings.append(warn)
        except Exception:
            pass

    # CLOCK GUARD Check
    clock_st, clock_err = check_clock_guard(db_path)
    if clock_st == "suspect" and clock_err:
        startup_warnings.append(clock_err)
        audit.record(
            event="server.clock_suspect",
            role="system",
            details={"warning": clock_err, "serverTime": datetime.datetime.now(datetime.timezone.utc).isoformat()},
        )


def run_daily_maintenance(db_path: str):
    """
    Daily maintenance tasks executed at BACKUP_TIME + 30m:
    1. PRAGMA wal_checkpoint(TRUNCATE)
    2. PRAGMA optimize
    3. Pruning idempotency keys, old print jobs, and audit logs
    4. Weekly (Sunday): PRAGMA integrity_check
    5. Monthly VACUUM: if > 20% free pages and system was idle for >= 2 minutes
    """
    global last_integrity_check
    logger.info("Starting automated daily database maintenance...")
    import time

    from app.core.database import SessionLocal
    from app.models import IdempotencyKey, PrintJob
    from app.services.audit import prune_audit_logs

    if not os.path.exists(db_path):
        return

    try:
        conn = sqlite3.connect(db_path, timeout=30.0)
        cur = conn.cursor()

        # 1. Checkpoint WAL
        cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        chk_res = cur.fetchall()
        logger.debug("WAL checkpoint result: %s", chk_res)

        # 2. Optimize SQLite query planner
        cur.execute("PRAGMA optimize")

        # 3. Weekly Sunday Integrity Check
        now = datetime.datetime.now()
        if now.weekday() == 6:  # Sunday
            logger.info("Executing scheduled weekly Sunday integrity check...")
            cur.execute("PRAGMA integrity_check")
            integ_res = cur.fetchall()
            status_text = "ok" if integ_res and integ_res[0][0].lower() == "ok" else str(integ_res)
            last_integrity_check = {"at": now.isoformat(), "result": status_text}
            logger.info("Weekly integrity check result: %s", status_text)
            audit.record(event="maintenance.integrity_check", role="system", details={"result": status_text})

        # 4. Monthly VACUUM Check
        # Check free pages: freelist_count / page_count
        cur.execute("PRAGMA page_count")
        page_count = cur.fetchone()[0]
        cur.execute("PRAGMA freelist_count")
        freelist_count = cur.fetchone()[0]

        free_pct = (freelist_count / page_count) * 100.0 if page_count > 0 else 0.0
        time_since_request = time.monotonic() - last_request_timestamp

        if now.day == 1 and free_pct > 20.0 and time_since_request > 120.0:
            logger.info("Executing monthly VACUUM (free pages=%.1f%%, idle for %.1fs)...", free_pct, time_since_request)
            cur.execute("VACUUM")
            logger.info("Monthly VACUUM completed.")
            audit.record(event="maintenance.vacuum", role="system", details={"freePagesPct": free_pct})
        elif now.day == 1 and free_pct > 20.0:
            logger.info("Skipping monthly VACUUM: server recently active (idle for only %.1fs)", time_since_request)

        conn.close()

        # 5. Database retention pruning
        db = SessionLocal()
        try:
            # Prune idempotency keys (> 24 hours old)
            idemp_cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
            db.query(IdempotencyKey).filter(IdempotencyKey.created_at < idemp_cutoff).delete(synchronize_session=False)

            # Prune print jobs (> PRINT_JOB_RETENTION_DAYS old)
            pj_cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=settings.PRINT_JOB_RETENTION_DAYS)
            db.query(PrintJob).filter(PrintJob.created_at < pj_cutoff).delete(synchronize_session=False)

            # Prune audit logs (> AUDIT_RETENTION_DAYS old)
            prune_audit_logs(db, settings.AUDIT_RETENTION_DAYS)

            db.commit()
        finally:
            db.close()

        logger.info("Daily database maintenance completed successfully.")
        audit.record(event="maintenance.daily", role="system", details={"status": "completed"})

    except Exception as e:
        logger.error("Error during daily database maintenance: %s", e, exc_info=True)


def run_shutdown_maintenance(db_path: str):
    """Executes PRAGMA optimize and PRAGMA wal_checkpoint on graceful shutdown."""
    if not os.path.exists(db_path):
        return
    try:
        conn = sqlite3.connect(db_path, timeout=5.0)
        cur = conn.cursor()
        cur.execute("PRAGMA optimize")
        cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
        logger.info("Shutdown database checkpoint completed.")
    except Exception as e:
        logger.debug("Error during shutdown checkpoint: %s", e)

