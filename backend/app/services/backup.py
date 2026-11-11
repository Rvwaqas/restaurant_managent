import asyncio
import datetime
import gzip
import hashlib
import logging
import os
import re
import shlex
import shutil
import sqlite3
import subprocess
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.timeutil import get_local_now
from app.services import audit

logger = logging.getLogger("pos.backup")

BACKUP_MUTEX = threading.Lock()
BACKUP_FILENAME_REGEX = re.compile(r"^pos-(\d{8})-(\d{6})-([\w\-]+)\.db\.gz$")

# Global in-memory status record for health reporting
_backup_status: Dict[str, Any] = {
    "last_success_at": None,
    "last_failure_message": None,
    "last_file": None,
    "last_size_bytes": 0,
    "last_duration_seconds": 0.0,
    "extra_copy_ok": True,
}


def get_sqlite_path(db_url: str) -> str:
    """Extracts filesystem path from SQLite database URL."""
    prefix = "sqlite:///"
    if db_url.startswith(prefix):
        return db_url[len(prefix):]
    return "pos.db"


def compute_sha256(filepath: str) -> str:
    """Computes SHA-256 hex digest of a file in 64KB chunks."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def get_backup_status() -> Dict[str, Any]:
    """Returns current backup subsystem status for health reporting."""
    global _backup_status
    status = dict(_backup_status)

    # Compute ageHours if last_success_at is known
    last_success = status.get("last_success_at")
    if last_success:
        try:
            dt = datetime.datetime.fromisoformat(last_success.replace("Z", "+00:00"))
            now = datetime.datetime.now(datetime.timezone.utc)
            status["age_hours"] = round((now - dt).total_seconds() / 3600.0, 1)
        except Exception:
            status["age_hours"] = None
    else:
        # Check if any backup exists on disk
        backups = list_backups()
        if backups:
            newest = backups[0]
            status["last_success_at"] = newest["ts"]
            status["last_file"] = newest["filename"]
            status["last_size_bytes"] = newest["size_bytes"]
            status["age_hours"] = newest["age_hours"]
        else:
            status["age_hours"] = None

    return status


def create_backup(
    reason: str = "manual",
    db_path: Optional[str] = None,
    backup_dir: Optional[str] = None,
    current_time: Optional[datetime.datetime] = None,
) -> Dict[str, Any]:
    """
    Performs a safe, non-blocking online backup of SQLite database using sqlite3 backup API.
    Guarantees consistency without copying live WAL files.
    Gzips the database, verifies integrity, computes sha256, copies to extra dir if set,
    runs optional BACKUP_COMMAND, and applies retention rules.
    """
    global _backup_status
    start_time = time.perf_counter()

    if not BACKUP_MUTEX.acquire(blocking=False):
        logger.warning("Backup request for reason '%s' skipped: another backup is currently in progress", reason)
        return {
            "success": False,
            "message": "Another backup operation is currently in progress",
            "error": "Another backup operation is currently in progress",
            "file": None,
        }

    try:
        source_db = db_path or get_sqlite_path(settings.DATABASE_URL)
        dest_dir = backup_dir or settings.BACKUP_DIR
        os.makedirs(dest_dir, exist_ok=True)

        if not os.path.exists(source_db):
            err = f"Source database '{source_db}' does not exist"
            logger.error(err)
            _backup_status["last_failure_message"] = err
            audit.record(event="backup.failed", role="system", details={"reason": reason, "error": err})
            return {"success": False, "message": err, "error": err, "file": None}

        # 1. Disk Space Verification
        db_size = os.path.getsize(source_db)
        wal_file = f"{source_db}-wal"
        if os.path.exists(wal_file):
            db_size += os.path.getsize(wal_file)

        _, _, free_bytes = shutil.disk_usage(dest_dir)
        free_mb = free_bytes / (1024.0 * 1024.0)
        required_mb = max(float(settings.BACKUP_MIN_FREE_MB), (db_size * 2.0) / (1024.0 * 1024.0))

        if free_mb < required_mb:
            err = f"Insufficient disk space in '{dest_dir}': {free_mb:.1f} MB free, {required_mb:.1f} MB required"
            logger.error(err)
            _backup_status["last_failure_message"] = err
            audit.record(event="backup.failed", role="system", details={"reason": reason, "error": err, "freeMb": free_mb})
            return {"success": False, "message": err, "error": err, "file": None}

        # 2. Online Backup via sqlite3 API into temporary file
        temp_id = f"tmp-{os.getpid()}-{int(time.time() * 1000)}"
        temp_db = os.path.join(dest_dir, f"{temp_id}.db")
        temp_gz = os.path.join(dest_dir, f"{temp_id}.db.gz")

        try:
            src_conn = sqlite3.connect(source_db, timeout=30.0)
            dst_conn = sqlite3.connect(temp_db)
            with dst_conn:
                src_conn.backup(dst_conn)
            dst_conn.close()
            src_conn.close()

            # 3. Integrity Verification on the Temporary Copy
            test_conn = sqlite3.connect(temp_db)
            cur = test_conn.cursor()
            cur.execute("PRAGMA integrity_check")
            integrity_rows = cur.fetchall()
            cur.execute("PRAGMA foreign_key_check")
            fk_rows = cur.fetchall()
            test_conn.close()

            if not integrity_rows or integrity_rows[0][0].lower() != "ok":
                raise RuntimeError(f"Integrity check failed on backup copy: {integrity_rows}")
            if fk_rows:
                raise RuntimeError(f"Foreign key check failed on backup copy: {fk_rows}")

            # 4. Gzip Compression
            with open(temp_db, "rb") as f_in, gzip.open(temp_gz, "wb", compresslevel=6) as f_out:
                shutil.copyfileobj(f_in, f_out, length=65536)

        finally:
            if os.path.exists(temp_db):
                try:
                    os.remove(temp_db)
                except Exception:
                    pass

        # 5. Compute Checksum & Atomically Rename to Canonical Filename
        sha256_hash = compute_sha256(temp_gz)
        now_dt = current_time or get_local_now()
        timestamp_str = now_dt.strftime("%Y%m%d-%H%M%S")
        target_filename = f"pos-{timestamp_str}-{reason}.db.gz"
        target_path = os.path.join(dest_dir, target_filename)

        os.replace(temp_gz, target_path)

        # Write .sha256 sidecar file
        sidecar_path = f"{target_path}.sha256"
        with open(sidecar_path, "w", encoding="utf-8") as f_sidecar:
            f_sidecar.write(f"{sha256_hash}  {target_filename}\n")

        size_bytes = os.path.getsize(target_path)
        duration_sec = round(time.perf_counter() - start_time, 2)

        # 6. Optional Copy to BACKUP_EXTRA_DIR (best effort)
        extra_ok = True
        if settings.BACKUP_EXTRA_DIR:
            try:
                os.makedirs(settings.BACKUP_EXTRA_DIR, exist_ok=True)
                extra_file = os.path.join(settings.BACKUP_EXTRA_DIR, target_filename)
                extra_sidecar = os.path.join(settings.BACKUP_EXTRA_DIR, f"{target_filename}.sha256")
                shutil.copy2(target_path, extra_file)
                shutil.copy2(sidecar_path, extra_sidecar)
                logger.info("Copied backup to extra storage: %s", extra_file)
            except Exception as e:
                extra_ok = False
                logger.warning("Failed to copy backup to BACKUP_EXTRA_DIR '%s': %s", settings.BACKUP_EXTRA_DIR, e)

        # 7. Optional BACKUP_COMMAND execution
        if settings.BACKUP_COMMAND:
            try:
                cmd_parts = shlex.split(settings.BACKUP_COMMAND) + [target_path]
                env = {**os.environ, "POS_BACKUP_FILE": target_path}
                logger.info("Executing BACKUP_COMMAND: %s", settings.BACKUP_COMMAND)
                proc = subprocess.run(
                    cmd_parts,
                    env=env,
                    timeout=120.0,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if proc.returncode != 0:
                    logger.warning("BACKUP_COMMAND exited with code %d: %s", proc.returncode, proc.stderr)
            except subprocess.TimeoutExpired:
                logger.warning("BACKUP_COMMAND timed out after 120 seconds")
            except Exception as e:
                logger.warning("Failed to execute BACKUP_COMMAND: %s", e)

        # 8. Apply Retention Rules
        pruned_files = apply_retention(dest_dir, current_time=now_dt)

        # 9. Record Audit & Update Status
        _backup_status.update({
            "last_success_at": now_dt.isoformat(),
            "last_failure_message": None,
            "last_file": target_filename,
            "last_size_bytes": size_bytes,
            "last_duration_seconds": duration_sec,
            "extra_copy_ok": extra_ok,
        })

        audit.record(
            event="backup.created",
            role="system",
            details={
                "file": target_filename,
                "reason": reason,
                "sizeBytes": size_bytes,
                "sha256": sha256_hash,
                "durationSec": duration_sec,
                "prunedCount": len(pruned_files),
                "extraCopyOk": extra_ok,
            },
        )

        logger.info(
            "Backup created successfully: %s (%s bytes, sha256=%s, duration=%.2fs)",
            target_filename,
            size_bytes,
            sha256_hash[:12],
            duration_sec,
        )

        return {
            "success": True,
            "filename": target_filename,
            "filepath": target_path,
            "sizeBytes": size_bytes,
            "sha256": sha256_hash,
            "durationSec": duration_sec,
            "extraCopyOk": extra_ok,
            "prunedCount": len(pruned_files),
        }

    except Exception as e:
        err_msg = str(e)
        logger.error("Backup creation failed for reason '%s': %s", reason, e, exc_info=True)
        _backup_status["last_failure_message"] = err_msg
        audit.record(event="backup.failed", role="system", details={"reason": reason, "error": err_msg})
        return {"success": False, "message": err_msg, "error": err_msg, "file": None}

    finally:
        BACKUP_MUTEX.release()


def apply_retention(backup_dir: str, current_time: Optional[datetime.datetime] = None) -> List[str]:
    """
    Applies backup retention policy according to B7 specification:
    - Retains newest N daily backups (BACKUP_KEEP_DAILY)
    - Retains latest per ISO week for weekly slots (BACKUP_KEEP_WEEKLY, Sundays preferred)
    - Retains first backup of each month for monthly slots (BACKUP_KEEP_MONTHLY)
    - NEVER deletes the most recent successful backup or anything younger than 24 hours.
    - Keeps pre-migration and pre-reset backups for at least 30 days.
    - Removes sidecar .sha256 files alongside deleted backups.
    Returns list of deleted filenames.
    """
    if not os.path.exists(backup_dir):
        return []

    now = current_time or get_local_now()
    if now.tzinfo is not None:
        now = now.replace(tzinfo=None)

    entries: List[Tuple[str, datetime.datetime, str, str]] = []  # (filename, dt, reason, full_path)

    for name in os.listdir(backup_dir):
        m = BACKUP_FILENAME_REGEX.match(name)
        if not m:
            continue
        date_part, time_part, reason = m.group(1), m.group(2), m.group(3)
        try:
            dt = datetime.datetime.strptime(f"{date_part}{time_part}", "%Y%m%d%H%M%S")
            full_path = os.path.join(backup_dir, name)
            entries.append((name, dt, reason, full_path))
        except Exception:
            continue

    if not entries:
        return []

    # Sort newest first
    entries.sort(key=lambda x: x[1], reverse=True)

    kept_files: set[str] = set()

    # Rule 1: NEVER delete the most recent backup
    kept_files.add(entries[0][0])

    # Rule 2: NEVER delete anything younger than 24 hours
    # Rule 3: Keep pre-migration and pre-reset for at least 30 days
    for name, dt, reason, _ in entries:
        age_seconds = (now - dt).total_seconds()
        if age_seconds < 86400.0:  # younger than 24h
            kept_files.add(name)
        elif reason in ("pre-migration", "pre-reset") and age_seconds < 30 * 86400.0:
            kept_files.add(name)

    # Slot 1: Newest N daily backups
    daily_seen: set[str] = set()
    daily_count = 0
    for name, dt, _, _ in entries:
        day_key = dt.strftime("%Y-%m-%d")
        if day_key not in daily_seen and daily_count < settings.BACKUP_KEEP_DAILY:
            daily_seen.add(day_key)
            kept_files.add(name)
            daily_count += 1

    # Slot 2: Weekly backups (newest N weeks; prefer Sunday backups)
    # Group entries by (year, iso_week)
    weeks: Dict[Tuple[int, int], List[Tuple[str, datetime.datetime]]] = {}
    for name, dt, _, _ in entries:
        wk_key = (dt.isocalendar().year, dt.isocalendar().week)
        weeks.setdefault(wk_key, []).append((name, dt))

    # Sort weeks newest first
    sorted_week_keys = sorted(weeks.keys(), reverse=True)[: settings.BACKUP_KEEP_WEEKLY]
    for wk_key in sorted_week_keys:
        candidates = weeks[wk_key]
        # Prefer Sunday backup (dt.weekday() == 6 in Python: Monday=0, Sunday=6)
        sunday_candidates = [c for c in candidates if c[1].weekday() == 6]
        chosen = sunday_candidates[0] if sunday_candidates else candidates[0]
        kept_files.add(chosen[0])

    # Slot 3: Monthly backups (first backup of each month, newest N months)
    months: Dict[Tuple[int, int], List[Tuple[str, datetime.datetime]]] = {}
    for name, dt, _, _ in entries:
        mo_key = (dt.year, dt.month)
        months.setdefault(mo_key, []).append((name, dt))

    sorted_month_keys = sorted(months.keys(), reverse=True)[: settings.BACKUP_KEEP_MONTHLY]
    for mo_key in sorted_month_keys:
        candidates = months[mo_key]
        # Prefer earliest backup in that month
        earliest = min(candidates, key=lambda c: c[1])
        kept_files.add(earliest[0])

    # Delete all unkept backups and their sidecars
    deleted: List[str] = []
    for name, _, _, full_path in entries:
        if name not in kept_files:
            try:
                os.remove(full_path)
                deleted.append(name)
                sidecar = f"{full_path}.sha256"
                if os.path.exists(sidecar):
                    os.remove(sidecar)
                logger.info("Pruned old backup: %s", name)
            except Exception as e:
                logger.warning("Failed to delete expired backup '%s': %s", name, e)

    return deleted


def verify_backup_file(file_path: str) -> Dict[str, Any]:
    """
    Verifies a backup file:
    1. Checks SHA-256 against .sha256 sidecar file if present.
    2. Gunzips into a temporary SQLite database.
    3. Runs PRAGMA integrity_check and foreign_key_check.
    4. Computes summary row counts (orders, paid bills, menu items, order date range).
    Cleans up temporary files.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Backup file '{file_path}' does not exist")

    # 1. SHA-256 Sidecar Verification
    actual_sha256 = compute_sha256(file_path)
    sidecar_path = f"{file_path}.sha256"
    sidecar_ok = None
    if os.path.exists(sidecar_path):
        try:
            with open(sidecar_path, "r", encoding="utf-8") as f:
                expected_sha = f.read().split()[0].strip()
                if expected_sha.lower() != actual_sha256.lower():
                    raise ValueError(f"Checksum mismatch! Expected {expected_sha}, calculated {actual_sha256}")
                sidecar_ok = True
        except ValueError:
            raise
        except Exception as e:
            logger.warning("Could not read sidecar file '%s': %s", sidecar_path, e)

    # 2. Decompress to temp file
    temp_unpacked = f"{file_path}.verify.tmp.db"
    try:
        with gzip.open(file_path, "rb") as f_in, open(temp_unpacked, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out, length=65536)

        # 3. Pragmas
        conn = sqlite3.connect(temp_unpacked)
        cur = conn.cursor()

        cur.execute("PRAGMA integrity_check")
        integrity_res = cur.fetchall()
        if not integrity_res or integrity_res[0][0].lower() != "ok":
            raise RuntimeError(f"Database integrity check failed: {integrity_res}")

        cur.execute("PRAGMA foreign_key_check")
        fk_res = cur.fetchall()
        if fk_res:
            raise RuntimeError(f"Foreign key check failed: {fk_res}")

        # 4. Extract diagnostic counts
        def get_count(table_name: str) -> int:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                return cur.fetchone()[0]
            except Exception:
                return 0

        orders_count = get_count("orders")
        items_count = get_count("menu_items")

        paid_bills_count = 0
        date_min, date_max = None, None
        try:
            cur.execute("SELECT COUNT(*) FROM orders WHERE status = 'paid'")
            paid_bills_count = cur.fetchone()[0]
            cur.execute("SELECT MIN(created_at), MAX(created_at) FROM orders")
            row = cur.fetchone()
            if row:
                date_min, date_max = row[0], row[1]
        except Exception:
            pass

        conn.close()

        return {
            "valid": True,
            "sha256": actual_sha256,
            "sidecarVerified": sidecar_ok,
            "sizeBytes": os.path.getsize(file_path),
            "ordersCount": orders_count,
            "paidBillsCount": paid_bills_count,
            "menuItemsCount": items_count,
            "orderDateMin": str(date_min) if date_min else None,
            "orderDateMax": str(date_max) if date_max else None,
        }

    finally:
        if os.path.exists(temp_unpacked):
            try:
                os.remove(temp_unpacked)
            except Exception:
                pass


def list_backups(backup_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lists all valid backup archives in backup_dir sorted newest first."""
    target_dir = backup_dir or settings.BACKUP_DIR
    if not os.path.exists(target_dir):
        return []

    now = datetime.datetime.now(datetime.timezone.utc)
    results = []

    for name in os.listdir(target_dir):
        m = BACKUP_FILENAME_REGEX.match(name)
        if not m:
            continue
        date_part, time_part, reason = m.group(1), m.group(2), m.group(3)
        full_path = os.path.join(target_dir, name)
        size_bytes = os.path.getsize(full_path)

        try:
            dt_naive = datetime.datetime.strptime(f"{date_part}{time_part}", "%Y%m%d%H%M%S")
            dt_utc = dt_naive.replace(tzinfo=datetime.timezone.utc)
            age_hours = round((now - dt_utc).total_seconds() / 3600.0, 1)
        except Exception:
            age_hours = 0.0

        sidecar_exists = os.path.exists(f"{full_path}.sha256")

        results.append({
            "filename": name,
            "filepath": full_path,
            "reason": reason,
            "ts": dt_naive.isoformat() if "dt_naive" in locals() else None,
            "size_bytes": size_bytes,
            "size_mb": round(size_bytes / (1024.0 * 1024.0), 2),
            "age_hours": age_hours,
            "sidecar_exists": sidecar_exists,
        })

    results.sort(key=lambda x: str(x.get("filename", "")), reverse=True)
    return results


def restore_backup(
    file_path: str,
    safety_copy: bool = True,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Restores the database from a backup archive:
    1. REFUSES to run if the server lock data/server.lock is held.
    2. Verifies the backup archive first (checksum & SQLite integrity check).
    3. Makes a safety copy of current DB: pos-before-restore-<timestamp>.db.gz.
    4. Deletes stale -wal and -shm files.
    5. Restores DB atomically.
    6. Runs PRAGMA integrity_check on the restored database.
    """
    from app.core.lock import is_server_running

    if is_server_running():
        raise RuntimeError("REFUSED: Another server instance is currently running. Stop the server before restoring.")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Backup file '{file_path}' does not exist")

    # 1. Verification of the target backup file
    verify_res = verify_backup_file(file_path)
    if not verify_res.get("valid"):
        raise RuntimeError("Backup archive failed verification; aborting restore")

    target_db = db_path or get_sqlite_path(settings.DATABASE_URL)
    dest_dir = os.path.dirname(os.path.abspath(target_db))
    os.makedirs(dest_dir, exist_ok=True)

    # 2. Safety copy of current database if present
    safety_file = None
    if safety_copy and os.path.exists(target_db):
        safety_ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_folder = settings.BACKUP_DIR
        os.makedirs(backup_folder, exist_ok=True)
        safety_file = os.path.join(backup_folder, f"pos-before-restore-{safety_ts}.db.gz")
        with open(target_db, "rb") as f_in, gzip.open(safety_file, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out, length=65536)
        logger.info("Created pre-restore safety copy: %s", safety_file)

    # 3. Clean up stale WAL / SHM files
    for suffix in ("-wal", "-shm"):
        stale_file = f"{target_db}{suffix}"
        if os.path.exists(stale_file):
            try:
                os.remove(stale_file)
            except Exception as e:
                logger.warning("Could not remove stale %s: %s", suffix, e)

    # 4. Decompress into temporary file and atomically replace target DB
    temp_restored = f"{target_db}.restore.tmp"
    try:
        with gzip.open(file_path, "rb") as f_in, open(temp_restored, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out, length=65536)

        # 5. Integrity check on newly uncompressed file
        chk_conn = sqlite3.connect(temp_restored)
        chk_cur = chk_conn.cursor()
        chk_cur.execute("PRAGMA integrity_check")
        res = chk_cur.fetchall()
        chk_conn.close()

        if not res or res[0][0].lower() != "ok":
            raise RuntimeError(f"Restored database integrity check failed: {res}")

        # Atomic replacement
        os.replace(temp_restored, target_db)

    finally:
        if os.path.exists(temp_restored):
            try:
                os.remove(temp_restored)
            except Exception:
                pass

    logger.info("Database successfully restored from %s", file_path)
    audit.record(
        event="maintenance.restore",
        role="system",
        details={"backupFile": os.path.basename(file_path), "safetyCopy": safety_file},
    )

    return {
        "success": True,
        "restoredFrom": file_path,
        "safetyCopy": safety_file,
        "ordersCount": verify_res.get("ordersCount", 0),
        "paidBillsCount": verify_res.get("paidBillsCount", 0),
        "menuItemsCount": verify_res.get("menuItemsCount", 0),
    }


def run_pre_migration_backup_if_needed() -> Optional[str]:
    """
    Checks if Alembic migrations are pending. If so, takes an automatic
    pre-migration backup before migrations execute.
    """
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        alembic_cfg = Config("backend/alembic.ini") if os.path.exists("backend/alembic.ini") else Config("alembic.ini")
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()

        db_path = get_sqlite_path(settings.DATABASE_URL)
        if not os.path.exists(db_path):
            return None

        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        try:
            cur.execute("SELECT version_num FROM alembic_version")
            current_rev = cur.fetchone()[0]
        except Exception:
            current_rev = None
        finally:
            conn.close()

        if current_rev != head_rev:
            logger.info("Alembic upgrade needed (%s -> %s). Creating pre-migration backup...", current_rev, head_rev)
            res = create_backup("pre-migration")
            if res.get("success"):
                return res.get("filename")
    except Exception as e:
        logger.warning("Could not check Alembic revision for pre-migration backup: %s", e)

    return None


async def run_backup_scheduler():
    """
    Asyncio background task running in single-worker lifespan:
    - Daily at BACKUP_TIME (e.g. 04:00 local) triggers create_backup('scheduled') in worker thread.
    - At startup, if the newest backup is > 26 hours old, runs 'startup-catchup'.
    """
    logger.info("Backup scheduler active: daily scheduled at %s", settings.BACKUP_TIME)

    # 1. Startup Catch-up Check
    try:
        backups = list_backups()
        should_catchup = False
        if not backups:
            should_catchup = True
        else:
            newest_age = backups[0]["age_hours"]
            if newest_age > 26.0:
                should_catchup = True

        if should_catchup:
            logger.info("Newest backup is older than 26 hours. Triggering background startup catch-up backup...")
            await asyncio.to_thread(create_backup, "startup-catchup")
    except Exception as e:
        logger.warning("Error during startup backup catch-up check: %s", e)

    # 2. Main Daily Loop
    while True:
        try:
            # Parse BACKUP_TIME (HH:MM)
            parts = settings.BACKUP_TIME.split(":")
            target_hour = int(parts[0])
            target_minute = int(parts[1]) if len(parts) > 1 else 0

            local_now = get_local_now()
            target_today = local_now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
            if target_today <= local_now:
                # Target time already passed today; schedule for tomorrow
                next_run = target_today + datetime.timedelta(days=1)
            else:
                next_run = target_today

            sleep_seconds = max(5.0, (next_run - local_now).total_seconds())
            logger.debug("Next scheduled backup in %.1f hours (at %s)", sleep_seconds / 3600.0, next_run.isoformat())

            await asyncio.sleep(sleep_seconds)

            logger.info("Starting scheduled daily backup...")
            await asyncio.to_thread(create_backup, "scheduled")

            # Avoid re-triggering immediately
            await asyncio.sleep(60.0)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Error in backup scheduler loop: %s", e)
            await asyncio.sleep(60.0)
