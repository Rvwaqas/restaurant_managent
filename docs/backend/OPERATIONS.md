# Restaurant POS - Operations & Maintenance Manual

> **Scope**: This document provides non-technical day-to-day procedures for restaurant owners and operational staff, as well as disaster-recovery steps and technical reference for Android tablet (Termux) and Linux/Windows deployments.

---

## 1. Quick Start & Daily Checklist

### 1.1 Morning Opening Checklist (Before Serving Customers)
1. **Ensure Tablet Is Plugged In**: Keep the server tablet connected to AC power with battery protection enabled (cap at 80% if supported).
2. **Verify System Health**:
   Open a terminal on the server device or workstation and run:
   ```bash
   python scripts/doctor.py
   ```
   - If output reports: `SYSTEM STATUS: READY FOR SERVICE` -> Proceed to open the restaurant.
   - If printers report `WARN (unreachable)` -> Ensure receipt & kitchen printers are powered ON and connected to the local Wi-Fi / Ethernet router.
   - If any `FAIL` is reported -> Review the details and follow Section 6 (Troubleshooting) before taking customer orders.
3. **Check Cashier Drawer / Receipt Paper**: Ensure rolls of 80mm thermal paper are loaded in all printers.

### 1.2 Evening Closing Checklist (End of Business Day)
1. **Close All Open Tables**:
   - Ensure all active customer tables have paid or voided orders.
   - Run daily closing report via admin reports dashboard.
2. **Automatic Daily Backup**:
   - The server automatically takes an online backup every night at `03:00` (or `BACKUP_TIME`).
   - If shutting down the server, a graceful shutdown backup is triggered automatically.
3. **Off-Device Backup Copy (Recommended Once Daily)**:
   - Insert a USB flash drive or ensure network sync folder (`BACKUP_EXTRA_DIR`) is connected.
   - Run manual backup or copy recent files from `data/backups/`.

---

## 2. Backup & Safety Subsystem

### 2.1 Where Backups Are Stored
- **Primary Backups**: `backend/data/backups/` (or `data/backups/`)
  - Formatted as `pos-<YYYYMMDD>-<HHMMSS>-<reason>.db.gz`
  - Each backup has a companion `.sha256` sidecar file containing its cryptographic checksum.
- **Secondary / USB Mirror**: Configured via `BACKUP_EXTRA_DIR` (e.g., `/mnt/media_rw/usb_drive` or an off-device directory).

### 2.2 Retention Policy
The POS automated retention policy prevents storage exhaustion while preserving full historical records:
- **Daily Backups**: Kept for 7 days (`BACKUP_KEEP_DAILY=7`).
- **Weekly Backups**: 4 weekly snapshots (Sundays preferred, `BACKUP_KEEP_WEEKLY=4`).
- **Monthly Backups**: 12 monthly snapshots (1st day of month, `BACKUP_KEEP_MONTHLY=12`).
- **Safety Protections**:
  - The single newest backup is **never** deleted.
  - Any backup less than 24 hours old is **never** deleted, regardless of quantity.
  - Pre-migration (`pre-migration-*`) and pre-reset (`pre-reset-*`) safety archives are **guaranteed for at least 30 days**.
  - Checksum sidecars (`.sha256`) are automatically pruned in lockstep with deleted archives (zero orphaned files).

---

## 3. Step-by-Step Recovery & Disaster Procedures

### 3.1 Scenario A: Restoring from a Backup (Within 30 Minutes)
If data was accidentally altered or a bad operational state occurred:

1. **Stop the Running POS Server**:
   ```bash
   # Terminate the uvicorn process (Ctrl+C or kill process)
   # Verify server lock is released:
   python -c "from app.core.lock import is_server_running; print('Running:', is_server_running())"
   ```
2. **List Available Backups**:
   ```bash
   python scripts/list_backups.py
   ```
3. **Verify the Selected Backup Archive**:
   ```bash
   python scripts/verify_backup.py pos-20261108-003657-manual.db.gz
   ```
   Ensure output ends with: `RESULT: VALID AND RESTORABLE`.
4. **Execute Safe Restore**:
   ```bash
   python scripts/restore.py pos-20261108-003657-manual.db.gz
   ```
   *Note: Type `RESTORE` when prompted. The tool will automatically create a pre-restore safety copy (`pos-before-restore-<timestamp>.db.gz`), purge stale SQLite WAL/SHM locks, and atomically restore the database.*
5. **Restart Server and Validate**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   python scripts/doctor.py
   ```

---

### 3.2 Scenario B: Tablet Death Recovery (Hardware Failure)
If the server tablet suffers hardware death, screen breakage, or water damage:

1. **Retrieve the Latest Backup**:
   - Pull the USB flash drive from the dead tablet (or access the `BACKUP_EXTRA_DIR` share).
   - Find the most recent `.db.gz` file and its `.sha256` sidecar.
2. **Setup Replacement Device (New Android Tablet or Laptop)**:
   - Install Termux or Python 3.11+.
   - Clone or copy the POS repository.
   - Run setup:
     ```bash
     cd backend
     pip install -r requirements.txt
     alembic upgrade head
     ```
3. **Restore the Backup File**:
   ```bash
   python scripts/restore.py /path/to/usb/pos-YYYYMMDD-HHMMSS.db.gz --yes
   ```
4. **Configure IP Address**:
   - Assign the new tablet the original server IP (e.g. `192.168.1.50`) on the Wi-Fi router, OR update the frontend `NEXT_PUBLIC_API_URL` to the new IP.
5. **Start POS Service**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   All waiter tablets and cashier terminals reconnect automatically via WebSocket/HTTP.

---

### 3.3 Scenario C: Go-Live / Reset Business Data (After Staff Training)
Before opening day, clear out all practice orders and demo transactions while keeping catalog configuration (floors, tables, menu categories, menu items, prices, printers, users):

1. **Stop the POS Server**:
   Ensure `data/server.lock` is free.
2. **Execute Business Data Reset**:
   ```bash
   python scripts/reset_business_data.py
   ```
   - Type `DELETE ALL ORDERS` when prompted.
   - The tool takes an automatic `pos-pre-reset-<timestamp>.db.gz` backup.
   - Cleans all orders, order items, print jobs, and idempotency records.
   - Resets all tables to `free`.
   - Runs `VACUUM` to reclaim disk storage.
3. **Verify Catalog Remains Intact**:
   ```bash
   python scripts/doctor.py
   ```

---

## 4. Diagnostics & Maintenance CLI Reference

All scripts reside in `scripts/` (and mirrored in `backend/scripts/`):

| Script | Purpose | Example Command |
|---|---|---|
| `doctor.py` | Full system audit (Python, SQLite, migrations, clock, printers, disk) | `python scripts/doctor.py [--url http://localhost:8000]` |
| `backup.py` | On-demand online backup with integrity checks | `python scripts/backup.py --reason pre-upgrade` |
| `list_backups.py` | View all available backups, timestamps, age, and sidecar status | `python scripts/list_backups.py` |
| `verify_backup.py` | Test backup decompression, SQLite pragmas, and row statistics | `python scripts/verify_backup.py <filename>` |
| `restore.py` | Overwrite-safe restore with server-lock protection & safety copy | `python scripts/restore.py <filename> [--yes]` |
| `reset_business_data.py` | Purge orders and transactions for fresh opening | `python scripts/reset_business_data.py [--yes]` |
| `export_bills.py` | Export accounting bills to CSV (Excel UTF-8 BOM) or JSON | `python scripts/export_bills.py --from 2026-01-01 --to 2026-12-31 --out bills.csv` |
| `check_users.py` | Validate `users.yaml` roles and scrypt hash formats | `python scripts/check_users.py` |
| `gen_secret.py` | Generate cryptographically strong random secret key | `python scripts/gen_secret.py` |
| `tail_audit.py` | View recent audit trail events with redaction of sensitive data | `python scripts/tail_audit.py -n 25 --event order.void` |

---

## 5. System Health Monitoring & APIs

### 5.1 Public Health (`GET /health` & `GET /api/health`)
Unauthenticated or waiter access:
```json
{
  "status": "ok",
  "time": "2026-11-08T00:34:55.123456Z",
  "db": "ok",
  "version": "1.0.0",
  "opening_time": "07:00",
  "closing_time": "23:00",
  "business_day_start_hour": 5,
  "ws": {
    "connections": 4
  }
}
```

### 5.2 Admin Health (`GET /health` with Admin Bearer Token)
Includes operational inspection fields:
- `uptimeSeconds`: Server uptime in seconds.
- `bootId`: Unique UUID generated at server boot.
- `freeDiskMb`: Remaining storage space on database drive.
- `clock`: Status of Clock Guard (`ok` or `suspect`).
- `backup`: Details of last successful/failed backup and freshness.
- `printers`: Real-time health status of kitchen and cashier printers.
- `warnings`: Active operational warnings.

---

## 6. Troubleshooting Guide

| Symptom | Likely Cause | Resolution Steps |
|---|---|---|
| `Server instance is currently running` | `data/server.lock` held by active process | If uvicorn is running, stop it first. If server crashed abnormally, verify PID is not active and delete `data/server.lock`. |
| `Integrity check failed on backup copy` | SQLite corruption during live read | Check disk health. Ensure `SQLITE_SYNCHRONOUS=FULL`. Run `python scripts/doctor.py`. |
| `Printer: <name> unreachable` | Thermal printer off or IP changed | Check physical power switch, paper jam, and verify network cable/Wi-Fi connection. |
| `Clock Guard: suspect clock` | Tablet RTC lost time after battery drain | Go to Android Settings -> Date & Time -> Set correct time or enable Network-provided time. |
| `Insufficient disk space in data/backups` | Disk usage exceeded threshold | Plug in external storage or adjust retention policy in `.env` (`BACKUP_KEEP_DAILY`). |
| `Failed to commit standalone audit entry` | Disk full or write permission error | Ensure `data/logs/` directory has write permissions. |

---

## 7. Technical Appendix: Durability & Architecture

- **SQLite WAL Mode**: POS operates in Write-Ahead Logging (`PRAGMA journal_mode=WAL`), allowing concurrent non-blocking reads during active order writes.
- **Synchronous Writes**: `SQLITE_SYNCHRONOUS=FULL` ensures operating system file flushes before returning transactions to disk.
- **Audit Trail**: Append-only storage in `audit_logs` SQLite table + rotating `data/logs/audit.log` text file with automatic redaction of credentials.
- **Server Lock**: Single-worker exclusive enforcement via `msvcrt.locking` on Windows and `fcntl.flock` on Linux/Android Termux.

---

## 8. Android Deployment & POS Management CLI

For step-by-step instructions on setting up an Android tablet under Termux, refer to the full [Android Deployment Guide](DEPLOY_ANDROID.md).

### 8.1 Unified CLI Commands (`./scripts/pos`)
```bash
./scripts/pos start            # Start supervisor & uvicorn server in background
./scripts/pos stop             # Gracefully stop server
./scripts/pos restart          # Restart server
./scripts/pos status           # View running state, PID, and restarts
./scripts/pos logs -n 50       # View recent server logs
./scripts/pos doctor           # Run 10-point system health check
./scripts/pos backup           # Run database and config/certificates backup
./scripts/pos urls --qr        # Display access URLs and terminal QR code
./scripts/pos update <bundle>  # Apply atomic update bundle with migration smoke check
./scripts/pos rollback         # Roll back to previous release
```

### 8.2 TLS Certificates & LAN IP Changes
When deploying under HTTPS mode (`SERVER_MODE=https`):
```bash
# Initialize Root CA and LAN server certificates:
python scripts/certs.py init

# Add a new LAN IP assigned by the Wi-Fi router (no CA reissue needed):
python scripts/certs.py add-ip 192.168.1.150

# Inspect certificate expiry and SAN entries:
python scripts/certs.py show
```


