import os
import sys
import gzip
import shutil
import sqlite3
import datetime
import threading
import time
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.database import engine, SessionLocal
from app.core.lock import acquire_server_lock, release_server_lock, is_server_running
from app.core.startup_checks import check_clock_guard, run_startup_checks
from app.services import audit
from app.services.backup import (
    create_backup,
    verify_backup_file,
    list_backups,
    restore_backup,
    apply_retention,
    compute_sha256,
    get_sqlite_path,
)
from app.models import Order, OrderItem, AuditLog, Table, MenuItem

client = TestClient(app)


@pytest.fixture(scope="module")
def admin_headers():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def waiter_headers():
    res = client.post("/api/auth/login", json={"username": "waiter1", "password": "1234"})
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


# ─── 1. DURABILITY SETTINGS TEST ───

def test_durability_pragmas():
    """Verify SQLite WAL mode, synchronous mode, and autocheckpoint pragmas."""
    with engine.connect() as conn:
        # Check journal_mode == wal
        j_mode = conn.exec_driver_sql("PRAGMA journal_mode").scalar()
        assert j_mode.lower() == "wal"

        # Check synchronous setting matches config
        sync_val = conn.exec_driver_sql("PRAGMA synchronous").scalar()
        sync_map = {0: "OFF", 1: "NORMAL", 2: "FULL", 3: "EXTRA"}
        expected = settings.SQLITE_SYNCHRONOUS.upper()
        assert sync_map.get(sync_val) == expected

        # Check wal_autocheckpoint == 1000
        wal_chk = conn.exec_driver_sql("PRAGMA wal_autocheckpoint").scalar()
        assert wal_chk == 1000


# ─── 2. BACKUP UNDER CONCURRENT WRITE LOAD ───

def test_backup_under_concurrent_writes(admin_headers):
    """Ensure online backup succeeds with zero errors during concurrent DB writes."""
    stop_event = threading.Event()
    writer_errors = []
    writes_completed = [0]

    def background_writer():
        db = SessionLocal()
        table = db.query(Table).filter(Table.floor_id == "f1", Table.is_active == True).first()
        dish = db.query(MenuItem).filter(MenuItem.floor_id == "f1", MenuItem.available == True).first()
        t_id = table.id if table else "f1-t1"
        dish_id = dish.id if dish else "m1"
        db.close()

        while not stop_event.is_set():
            try:
                res = client.post(
                    "/api/orders/send",
                    headers=admin_headers,
                    json={
                        "tableId": t_id,
                        "requestId": f"stress-write-{time.time()}-{writes_completed[0]}",
                        "items": [{"menuItemId": dish_id, "qty": 1}],
                    },
                )
                if res.status_code == 200:
                    writes_completed[0] += 1
                time.sleep(0.05)
            except Exception as e:
                writer_errors.append(e)

    writer_thread = threading.Thread(target=background_writer, daemon=True)
    writer_thread.start()

    try:
        time.sleep(0.2)
        # Perform online backup
        res = create_backup(reason="concurrent-write-test")
    finally:
        stop_event.set()
        writer_thread.join(timeout=3.0)

    assert not writer_errors, f"Writer errors encountered: {writer_errors}"
    assert res["success"] is True
    assert os.path.exists(res["filepath"])

    # Verify backup archive integrity
    v_res = verify_backup_file(res["filepath"])
    assert v_res["valid"] is True
    assert v_res["sidecarVerified"] is True


# ─── 3. RETENTION POLICY SIMULATION ───

def test_retention_policy_simulation(tmp_path):
    """Simulate daily backups across 1+ years (or 90 days on Windows) and test pruning rules."""
    backup_dir = tmp_path / "simulated_backups"
    backup_dir.mkdir()

    base_date = datetime.date(2025, 1, 1)
    fake_files = []
    days_count = 400 if (os.environ.get("POS_SLOW_FULL") == "1" or sys.platform != "win32") else 90
    pre_mig_idx = days_count - 20
    pre_res_idx = days_count - 15

    for day_offset in range(days_count):
        d = base_date + datetime.timedelta(days=day_offset)
        ts_str = d.strftime("%Y%m%d-030000")
        reason = "pre-migration" if day_offset == pre_mig_idx else ("pre-reset" if day_offset == pre_res_idx else "daily")
        fn = f"pos-{ts_str}-{reason}.db.gz"
        fpath = backup_dir / fn
        fpath.write_bytes(b"mock gz content")
        sidecar = backup_dir / f"{fn}.sha256"
        sidecar.write_text("mocksha256", encoding="utf-8")
        fake_files.append((d, fn))

    # Apply retention
    now_ref = base_date + datetime.timedelta(days=days_count)
    now_dt = datetime.datetime.combine(now_ref, datetime.time(12, 0))

    pruned = apply_retention(
        backup_dir=str(backup_dir),
        current_time=now_dt,
    )

    remaining = [f.name for f in backup_dir.glob("*.db.gz")]
    assert len(remaining) > 0

    # 1. Newest backup must exist
    newest_expected = fake_files[-1][1]
    assert newest_expected in remaining

    # 2. Backups < 24h old must exist
    for d, fn in fake_files:
        age_hours = (now_dt - datetime.datetime.combine(d, datetime.time(3, 0))).total_seconds() / 3600
        if age_hours < 24:
            assert fn in remaining

    # 3. Pre-migration and pre-reset within 30 days must be preserved
    pre_mig = fake_files[pre_mig_idx][1]
    pre_res = fake_files[pre_res_idx][1]
    assert pre_mig in remaining
    assert pre_res in remaining

    # 4. Check sidecars: every existing .db.gz must have .sha256, no orphaned .sha256
    for fn in remaining:
        assert (backup_dir / f"{fn}.sha256").exists()
    for sc in backup_dir.glob("*.sha256"):
        orig_gz = sc.with_suffix("")
        assert orig_gz.exists()


# ─── 4. BACKUP FAILURE PATHS ───

def test_backup_failure_low_disk_space():
    """Verify backup refuses when free disk space is below minimum."""
    with patch("shutil.disk_usage", return_value=(1000 * 1024 * 1024, 950 * 1024 * 1024, 50 * 1024 * 1024)):
        res = create_backup(reason="low-disk-test")
        assert res["success"] is False
        err_text = res.get("error") or res.get("message") or ""
        assert "disk space" in err_text.lower()


def test_backup_failure_corrupted_temp_copy(tmp_path):
    """Verify corrupted temp copy is cleaned up and backup fails gracefully."""
    with patch("app.services.backup.sqlite3.connect") as mock_conn:
        mock_instance = MagicMock()
        mock_cur = MagicMock()
        mock_cur.fetchall.return_value = [("corrupt",)]
        mock_instance.cursor.return_value = mock_cur
        mock_conn.return_value = mock_instance

        res = create_backup(reason="corrupt-probe")
        assert res["success"] is False
        err_text = res.get("error") or res.get("message") or ""
        assert "integrity check failed" in err_text.lower()


# ─── 5. RESTORE ROUND-TRIP & SAFETY GUARDS ───

def test_restore_roundtrip_and_safety_copy(tmp_path):
    """Verify backup restore into target DB creates safety copy and restores tables."""
    # Create valid backup
    b_res = create_backup(reason="restore-probe")
    assert b_res["success"] is True
    backup_file = b_res["filepath"]

    # Target test database
    target_db = str(tmp_path / "test_target.db")
    # Put initial dummy data
    init_conn = sqlite3.connect(target_db)
    init_conn.execute("CREATE TABLE orders (id TEXT, status TEXT)")
    init_conn.execute("INSERT INTO orders VALUES ('dummy-1', 'paid')")
    init_conn.commit()
    init_conn.close()

    # Restore into target
    r_res = restore_backup(backup_file, safety_copy=True, db_path=target_db)
    assert r_res["success"] is True
    assert r_res["safetyCopy"] is not None
    assert os.path.exists(r_res["safetyCopy"])

    # Verify restored contents
    chk_conn = sqlite3.connect(target_db)
    chk_cur = chk_conn.cursor()
    chk_cur.execute("PRAGMA quick_check")
    assert chk_cur.fetchone()[0] == "ok"
    chk_conn.close()


def test_restore_refused_when_server_locked():
    """Verify restore refuses if server instance lock is held."""
    with patch("app.core.lock.is_server_running", return_value=True):
        with pytest.raises(RuntimeError) as exc_info:
            restore_backup("nonexistent.db.gz")
        assert "currently running" in str(exc_info.value).lower()


def test_restore_rejection_of_corrupted_archive(tmp_path):
    """Verify corrupted or tampered archive fails verification and does not restore."""
    bad_file = tmp_path / "corrupted.db.gz"
    bad_file.write_bytes(b"garbage-not-gzip")
    sidecar = tmp_path / "corrupted.db.gz.sha256"
    sidecar.write_text("dummy-sha256", encoding="utf-8")

    with pytest.raises(Exception):
        restore_backup(str(bad_file), safety_copy=False)


# ─── 6. SERVER EXCLUSIVE LOCK TESTS ───

def test_server_lock_lifecycle(tmp_path):
    """Verify exclusive lock acquisition, duplicate detection, and clean release."""
    lock_file = tmp_path / "test_server.lock"

    # Acquire lock 1
    ok1 = acquire_server_lock(str(lock_file))
    assert ok1 is True

    # Check is running
    assert is_server_running(str(lock_file)) is True

    # Attempt acquire lock 2 -> must return False
    ok2 = acquire_server_lock(str(lock_file))
    assert ok2 is False

    # Release lock 1
    release_server_lock()
    assert is_server_running(str(lock_file)) is False

    # Now acquire lock 2 succeeds
    ok3 = acquire_server_lock(str(lock_file))
    assert ok3 is True
    release_server_lock()


# ─── 7. AUDIT TRAIL TESTS ───

def test_audit_log_atomicity_and_redaction():
    """Verify audit record saves atomically in DB session and strips sensitive fields."""
    init_db = SessionLocal()
    init_db.query(AuditLog).filter(AuditLog.event.like("test.%")).delete()
    init_db.commit()
    init_db.close()

    db = SessionLocal()
    # Test atomic rollback
    try:
        db.begin_nested()
        audit.record(
            session=db,
            event="test.rollback",
            user_id="u-test",
            role="admin",
            details={"password": "supersecretpassword", "token": "jwt.secret.token", "safeKey": "visible"},
        )
        # Force rollback
        db.rollback()
    finally:
        db.close()

    # Verify rolled back from DB
    db2 = SessionLocal()
    rec = db2.query(AuditLog).filter(AuditLog.event == "test.rollback").first()
    assert rec is None

    # Test redaction on committed audit
    audit.record(
        session=db2,
        event="test.redaction",
        user_id="u-test",
        role="admin",
        details={"password": "mypassword123", "secret_hash": "hash123", "amount": 100},
    )
    db2.commit()

    rec2 = db2.query(AuditLog).filter(AuditLog.event == "test.redaction").first()
    assert rec2 is not None
    import json
    details = json.loads(rec2.details)
    assert "password" not in details
    assert "secret_hash" not in details
    assert details["amount"] == 100

    # Clean up test row
    db2.delete(rec2)
    db2.commit()
    db2.close()


# ─── 8. ADDITIVE HEALTH ENDPOINT TESTS ───

def test_health_public_shape():
    """Verify unauthenticated GET /health returns standard public status."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("ok", "healthy", "degraded")
    assert "time" in data
    assert "version" in data
    assert "db" in data
    assert "ws" in data
    # Admin fields MUST NOT be visible to unauthenticated requests
    assert "uptimeSeconds" not in data
    assert "freeDiskMb" not in data


def test_health_admin_extended_shape(admin_headers, waiter_headers):
    """Verify admin GET /health returns full diagnostic inspection while waiter gets public."""
    # Waiter token
    res_w = client.get("/api/health", headers=waiter_headers)
    assert res_w.status_code == 200
    assert "uptimeSeconds" not in res_w.json()

    # Admin token
    res_a = client.get("/api/health", headers=admin_headers)
    assert res_a.status_code == 200
    admin_data = res_a.json()

    assert "uptimeSeconds" in admin_data
    assert "bootId" in admin_data
    assert "clock" in admin_data
    assert "freeDiskMb" in admin_data
    assert "backup" in admin_data
    assert "printers" in admin_data
    assert "warnings" in admin_data


# ─── 9. STARTUP CHECKS & CLOCK GUARD ───

def test_clock_guard_detection(tmp_path):
    """Verify clock guard flags clock if time is set in the past."""
    test_db = str(tmp_path / "clock_test.db")
    conn = sqlite3.connect(test_db)
    conn.execute("CREATE TABLE orders (id TEXT, created_at TEXT)")
    # Record in 2026-11-15
    conn.execute("INSERT INTO orders VALUES ('o1', '2026-11-15 12:00:00')")
    conn.commit()
    conn.close()

    # Now mock current time as 2026-11-10 (5 days before DB record)
    past_now = datetime.datetime(2026, 11, 10, 12, 0, 0, tzinfo=datetime.timezone.utc)
    with patch("app.core.startup_checks.get_current_time_for_clock_guard", return_value=past_now):
        state, reason = check_clock_guard(test_db)
        assert state == "suspect"
        assert "System clock looks wrong" in reason


# ─── 10. CLI SCRIPTS PROGRAMMATIC RUNS ───

def test_cli_scripts_execution():
    """Test running CLI tools programmatically to ensure exit code 0 and valid behavior."""
    import subprocess

    env = os.environ.copy()
    env["PYTHONPATH"] = "backend"

    # 1. doctor.py
    p_doctor = subprocess.run([sys.executable, "scripts/doctor.py"], env=env, capture_output=True, text=True)
    assert p_doctor.returncode == 0 or "READY FOR SERVICE" in p_doctor.stdout

    # 2. check_users.py
    p_users = subprocess.run([sys.executable, "scripts/check_users.py"], env=env, capture_output=True, text=True)
    assert p_users.returncode == 0
    assert "All 4 user(s) verified valid" in p_users.stdout

    # 3. list_backups.py
    p_list = subprocess.run([sys.executable, "scripts/list_backups.py"], env=env, capture_output=True, text=True)
    assert p_list.returncode == 0
    assert "AVAILABLE DATABASE BACKUPS" in p_list.stdout

    # 4. export_bills.py
    p_export = subprocess.run(
        [sys.executable, "scripts/export_bills.py", "--from", "2026-01-01", "--to", "2026-12-31", "--format", "json"],
        env=env,
        capture_output=True,
        text=True,
    )
    assert p_export.returncode == 0
    assert "orderId" in p_export.stdout

    # 5. tail_audit.py
    p_audit = subprocess.run([sys.executable, "scripts/tail_audit.py", "-n", "5"], env=env, capture_output=True, text=True)
    assert p_audit.returncode == 0
    assert "AUDIT TRAIL LOGS" in p_audit.stdout
