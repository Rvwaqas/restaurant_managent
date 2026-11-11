# Thermal ESC/POS Network Printing Architecture & Hardware Guide

This document defines the network thermal receipt printing architecture for the Restaurant POS backend, including configuration, layout renderers, ESC/POS byte generation, crash recovery, and hardware troubleshooting.

---

## 1. Architectural Overview

The backend printing subsystem is designed for low-power, zero-compilation deployment (including lightweight Linux boxes and Android/Termux environments) with **pure Python** socket and byte handling:

```
+-------------------------------------------------------------------------------+
|                             FastAPI Request Handlers                          |
|  (orders: send_items, void_item, pay_order, reprint_bill, reprint_kitchen)   |
+-------------------------------------------------------------------------------+
                                      |
                      1. DB Transaction (write_transaction)
                      2. Creates PrintJob row (status='queued', JSON snapshot)
                      3. db.commit()
                                      v
+-------------------------------------------------------------------------------+
|                    Out-of-Transaction Printing Dispatcher                     |
|                 (app.services.printing.dispatcher.py)                        |
|                                                                               |
|   - ThreadPoolExecutor (max 4 concurrent printer connections)                |
|   - Request execution cap (~6.0s timeout safeguard)                           |
|   - Compare-and-Set status update ('queued' -> 'printed' / 'failed')          |
+-------------------------------------------------------------------------------+
           |                                                   |
   [Mode: simulate]                                    [Mode: network]
           |                                                   |
           v                                                   v
+------------------------+                          +--------------------------+
|  SimulatePrinterDriver |                          |   NetworkPrinterDriver   |
|                        |                          |                          |
| - Writes .txt preview  |                          | - TCP Socket (port 9100) |
| - Writes .bin raw bytes|                          | - Per-printer thread lock|
| - Simulates failures   |                          |   with 100ms safety gap  |
|   via env config       |                          | - DLE EOT status check   |
|   (data/print_sim/)    |                          | - In-memory health track |
+------------------------+                          +--------------------------+
```

### Guiding Principles
1. **Out-of-Transaction Printing**: Socket operations and printer drivers are **never** executed inside a database transaction. Even if all thermal printers are offline, power-cut, or unplugged, order operations (sending items, taking payments, voiding items) always commit and succeed.
2. **Pure Python Standard Library**: No external compiled dependencies (such as `python-escpos` or `Pillow`). ESC/POS command bytes are generated directly using Python bytearrays.
3. **Frontend Visual Parity**: All slips match the information hierarchy, line items, notes, taxes, and totals of the React slip preview components (`src/components/slips/`) adapted to clean monospace formatting.

---

## 2. Supported Slip Kinds

| Kind | Purpose | Key Elements Rendered | Trigger |
| :--- | :--- | :--- | :--- |
| **`kitchen`** | Kitchen Order Ticket (KOT) | Station Header, `TABLE: #<num>`, `FLOOR`, `BATCH #`, `WAITER`, Timestamp, `QTYx Item Name`, Notes (`** NOTE: ... **`), `TOTAL ITEMS`, Cut. Includes `*** REPRINT ***` or `(delayed)` badge if applicable. | Waiter sends items or reprints KOT. |
| **`cancel`** | Kitchen Cancellation | Inverted `*** ITEM CANCELLED ***`, `DO NOT PREPARE`, Station, Table, Floor, `AUTH: <admin>`, `-<qty>x <dish>`, `REASON: <reason>`, Cut. | Admin voids an order item. |
| **`bill`** | Customer Final Bill | Centered Restaurant Name, Floor, `*** FINAL BILL RECEIPT ***`, Bill No, Table, Waiter, Payment Method, Itemized table (Adaptive 4-col for 48c, 3-col for 32/42c), Subtotal, Discount, Tax & Service Charge (only if > 0), Double-height Grand Total, Cash Received & Change Due (for cash), Cut, Cash drawer pulse (optional). Includes `*** DUPLICATE COPY ***` on reprint. | Payment confirmed or reprint bill. |
| **`test`** | Calibration & Diagnostic | Header, Printer Name, IP:Port, Role, Repeating 10-digit ruler (`1234567890...`), Configured Column Marker, `TEST PRINT OK`, Cut. | Admin test print button or CLI tool. |

---

## 3. Configuration & Column Calibration

### Settings (`backend/.env`)

```ini
# Printing Configuration
PRINT_MODE=simulate                # "simulate" or "network"
PRINT_COLUMNS=48                   # 32 (58mm), 42 (80mm wide font B), or 48 (80mm standard font A)
PRINT_CONNECT_TIMEOUT=2.0          # Socket connect timeout in seconds
PRINT_SEND_TIMEOUT=4.0             # Socket send/drain timeout in seconds
PRINT_CHECK_STATUS=true            # Query DLE EOT status before transmission (best-effort)
PRINT_CUT=true                     # Emit partial cut command (GS V 66 0) at end of slip
PRINT_CASH_DRAWER_KICK=false       # Emit 24V drawer pulse (ESC p 0 25 250) on cash bills
PRINT_RECOVER_MAX_AGE_MINUTES=10   # Max age of queued jobs to re-dispatch on restart
PRINT_JOB_RETENTION_DAYS=60        # Days to keep print job logs before automated cleanup
PRINT_SIM_DIR=data/print_sim       # Output directory for simulate mode (.bin and .txt)
SIMULATE_FAIL_PRINTERS=            # Comma-separated printer IDs to simulate failure (e.g. "p3")
```

### Column Calibration via Ruler Slip

Thermal printers typically support:
- **80mm Paper**: 48 columns (Font A 12x24) or 42 columns (Font B 9x17 or older printers).
- **58mm Paper**: 32 columns.

To calibrate your hardware:
1. Run a test print to your physical printer:
   ```powershell
   python backend/scripts/print_test.py --printer 192.168.1.101 --port 9100
   ```
2. Inspect the printed ruler line (`12345678901234567890...`):
   - If the ruler prints on a single crisp line without wrapping to a second line, `PRINT_COLUMNS` matches your hardware.
   - If the numbers wrap onto the next line (e.g. wraps after 42 characters), configure `PRINT_COLUMNS=42` in `.env`.
   - For 58mm compact printers, configure `PRINT_COLUMNS=32` in `.env`.

---

## 4. Hardware Verification CLI Tools

The backend includes three dedicated operational CLI tools located in `backend/scripts/`:

### A. Preview Slips in Terminal / Monospace
Preview any slip kind across columns (32, 42, 48) or inspect a recorded database job:
```powershell
# Preview sample kitchen slip on 48 columns
python backend/scripts/preview_slip.py --sample kitchen --columns 48

# Preview sample customer bill on 32 columns
python backend/scripts/preview_slip.py --sample bill --columns 32

# Preview and dump binary ESC/POS bytes to file
python backend/scripts/preview_slip.py --sample bill --columns 48 --bin bill_sample.bin

# Inspect layout of an existing job from the SQLite database
python backend/scripts/preview_slip.py --job pj-test-12345678
```

### B. Trigger Test Print Slip
Send a live test slip to a printer defined in the database or directly by IPv4 address:
```powershell
# Send test slip to database printer
python backend/scripts/print_test.py --printer prn-kitchen

# Send test slip directly to hardware IP (without database entry)
python backend/scripts/print_test.py --printer 192.168.1.101 --port 9100
```

### C. Query Hardware & Health Status
Inspect real-time hardware status (DLE EOT query) and application health:
```powershell
python backend/scripts/printer_status.py --printer 192.168.1.101 --port 9100
```
Example Output:
```
==================================================
PRINTER STATUS: Thermal Printer
Address: 192.168.1.101:9100
==================================================
Application Health:
  State: OK
  Consecutive Failures: 0
  Last Success: 2026-11-06 17:35:58 UTC
  Last Failure: None

Hardware Query (ESC/POS DLE EOT):
  Connection: REACHABLE
  Details: Queried successfully
  Raw DLE EOT 1: 0x12
  Online State: ONLINE
  Cover Open: NO (CLOSED)
  Raw DLE EOT 4: 0x12
  Paper Out: NO (PAPER OK)
==================================================
```

---

## 5. Network Setup & Printer Connectivity

1. **Static IP Assignment**: Assign static IPv4 addresses or DHCP reservations on your restaurant router:
   - `192.168.1.101` -> Kitchen Station 1
   - `192.168.1.102` -> Kitchen Station 2
   - `192.168.1.103` -> Cashier Counter
2. **Port 9100 (RAW TCP)**: Ensure the printer's network board has TCP port 9100 enabled (standard RAW printing port).
3. **Per-Printer Locking & Concurrency**:
   - The driver maintains an in-memory lock (`_get_printer_lock(printer_id)`) per printer with a 100ms pause between jobs. This guarantees that simultaneous tickets sent by multiple waiters do not corrupt the printer's internal paper buffer.
   - Different printers print concurrently across worker threads without blocking each other.

---

## 6. Crash Recovery & Retention Maintenance

1. **Queue Recovery on Server Restart**:
   - If the server restarts while jobs were in `status='queued'`:
     - Jobs created **< 10 minutes** ago (`PRINT_RECOVER_MAX_AGE_MINUTES`) are automatically re-dispatched with `"delayed": True`, printing `(delayed)` on the slip so kitchen staff know it was queued prior to the reboot.
     - Jobs created **>= 10 minutes** ago are marked `status='failed'` with `error='Expired: server was restarted while queued (>10m ago)'` to prevent accidental cooking of stale orders.
2. **Automated 60-Day Retention**:
   - On server startup, `cleanup_old_print_jobs()` purges completed print job records older than 60 days (`PRINT_JOB_RETENTION_DAYS`) to prevent SQLite database growth.

---

## 7. Troubleshooting Matrix

| Symptom | Probable Cause | Resolution |
| :--- | :--- | :--- |
| **"Printer not reachable: connection timed out after 2.0s"** | 1. Printer is turned off.<br>2. IP changed via DHCP.<br>3. Ethernet cable disconnected. | Check power, Ethernet link LED, and verify IP via printer test feed button (hold feed while turning on power). |
| **"Connection refused"** | Printer port 9100 is disabled or firewall block. | Enable RAW/Port 9100 printing in printer's web configuration interface. |
| **Text lines wrapping prematurely or overlapping** | Incorrect `PRINT_COLUMNS` setting. | Run `preview_slip.py --sample test` and match `PRINT_COLUMNS` (32 for 58mm; 42/48 for 80mm). |
| **Garbled / Chinese / Question marks (`?`)** | Non-ASCII or special symbols sent. | The driver normalizes text with NFKD and maps unsupported characters to `?`. Check dish names in Menu Admin. |
| **Printer prints but cutter does not cut** | Printer does not support partial cut or `PRINT_CUT=false`. | Set `PRINT_CUT=true` in `.env`. Ensure printer hardware has an auto-cutter. |
| **Cash drawer does not kick open on payment** | `PRINT_CASH_DRAWER_KICK=false` or drawer cable disconnected. | Connect RJ11/RJ12 drawer cable directly to receipt printer's DK port and set `PRINT_CASH_DRAWER_KICK=true`. |

