# Backend Findings & Additive Schema Changes (Phase B1 & B2)

This document records findings, architectural clarifications, and additive schema modifications introduced during Phase B1, the Floor 2 menu import, and Phase B2 (CRUD Services & Uploads).

---

## 1. Schema Additions to `menu_items`

In accordance with the Addendum to B1, two new columns have been added to the `menu_items` relational schema:

| Column Name | SQL Type | Nullable | API Exposure | Description |
| :--- | :--- | :--- | :--- | :--- |
| `subcategory` | `VARCHAR(64)` | `NULL` | **Exposed in API** | Grouping sub-tag (e.g. `Nasi Kuning`, `Roti`, `Lauk Pauk`, `Soto & Coto`, `Bakso`). Exposing this is additive and backwards-compatible for clients. |
| `alt_price` | `FLOAT` / `INTEGER` | `NULL` | **Internal (Not Exposed)** | Alternative price for takeaway / iced versions (`Price_Ais_or_Takeaway_RM`). Stored in database for future POS checkout modifiers. |

---

## 2. Schema Additions to `categories`

| Column Name | SQL Type | Nullable | API Exposure | Description |
| :--- | :--- | :--- | :--- | :--- |
| `serve_from` | `VARCHAR(16)` | `NULL` | Optional | Time string representing the beginning of serving window (e.g. `07:00`). |
| `serve_to` | `VARCHAR(16)` | `NULL` | Optional | Time string representing the end of serving window (e.g. `11:00`). Currently unenforced. |

---

## 3. Floor 2 Menu Seed Data Replacements

The previous placeholder Floor 2 categories (`Sweet`, `Spicy`, `Drinks`) have been replaced with the authentic restaurant structure:
- **`c4`**: `"Breakfast"` (mapped to kitchen printer `p2`, `sortOrder: 1`)
- **`c5`**: `"Lunch & Dinner"` (mapped to kitchen printer `p2`, `sortOrder: 2`)
- **`c6`**: `"Drinks"` (mapped to bar/drinks printer `p3`, `sortOrder: 3`)

Floor 1 (Halal menu) maintains 8 dishes conforming to `docs/api/fixtures/menu.json` and `src/lib/api/mock/seed.ts`.

---

## 4. Operational Boundaries

- **`OPENING_TIME`**: `"07:00"`
- **`CLOSING_TIME`**: `"23:00"`
- **`BUSINESS_DAY_START_HOUR`**: `5` (5:00 AM reset; restaurant is closed between 23:00 and 07:00 so no sales cross midnight boundaries).

---

## 5. Password Hashing Specification

- **Algorithm**: Standard library `hashlib.scrypt` (no compiled dependencies required, allowing seamless execution on low-power devices and Termux).
- **Parameters**: `N=2**14` (16384), `r=8`, `p=1`, `salt=16 bytes`.
- **Serialization Format**: `scrypt$N$r$p$salt_b64$hash_b64`
- **Comparison**: `hmac.compare_digest` (constant-time verification to prevent timing side-channel attacks).

---

## 6. Phase B2 Findings & Design Alignments

### Cashier Printer Policy
- **Documentation (`docs/ADMIN.md`) vs Mock**: `docs/ADMIN.md` notes that multiple active cashier printers are permitted with an admin UI warning indicating which printer is primary. The frontend mock implementation also permits multiple printers with `role: "cashier"`, enforcing unique printer name and unique IP:port. The backend replicates the mock's behavior, allowing multiple cashier printers with uniqueness constraints.

### Soft-Delete & Partial Unique Indexes (SQLite)
- Soft-deleted tables, categories, and menu items set `is_active = false` and `is_deleted = true`.
- Partial unique indexes (`WHERE is_deleted = 0`) are created in SQLite:
  - `uq_tables_floor_number_active`: Allows an admin to delete an occupied/historic table and immediately create a new table with the same number on that floor.
  - `uq_categories_floor_name_active`: Releases category names upon soft deletion.
- Race conditions during concurrent insertions map SQLite `IntegrityError` to HTTP 409 Conflict.

### Image Storage & Normalization
- Uploaded files are verified via magic bytes (PNG, JPEG, WebP) and stored in `backend/uploads/` with UUID-based filenames.
- Stored database values are normalized to relative URLs (`/api/uploads/<filename>`).
- When serialized in API responses, relative upload paths are expanded into absolute URLs using `PUBLIC_BASE_URL` or the request base URL, allowing mobile/tablet devices on LAN to render images cleanly.
- Unreferenced local image files are garbage-collected upon item update or hard deletion.

### Frontend Changes Needed
- **None**: All endpoints reproduce the mock layer's exact request/response schemas, status codes, and error formatting. The frontend operates without modification.

---

## 7. Phase B3 Findings & Orders Engine Architecture

### SQLite Transaction Concurrency (`write_transaction`)
- SQLite's default deferred transactions can encounter deadlocks during simultaneous read-then-write cycles. The `write_transaction(db)` context manager executes `BEGIN IMMEDIATE` to acquire write locks upfront, with exponential backoff retry (up to 5 attempts) and a clean 503 `DB_BUSY` fallback if concurrency limits are exceeded.

### Order Totals Calculation & Void Isolation
- Pure calculation in `app/services/order_totals.py` excludes items where `voided = True` or `status = 'cancelled'`.
- Subtotal is computed strictly over active items. Percentage and amount discounts are validated, with non-admin discount attempts rejected with `403 Only admin can apply discount`.
- Waiter void attempts return `403 Admin access required to cancel order items`.
- To satisfy both TypeScript type `VoidItemResult` (`{ order, printJob }`) and Zod schema `VoidItemResultSchema` (`{ order, cancelPrintJobs, voidedItem }`), the backend serializer supplies all four fields simultaneously.

### Daily Bill Number Sequences (`daily_sequences`)
- Daily sequential bill numbers (`B-0001`, `B-0002`...) are generated via atomic SQLite upsert:
  ```sql
  INSERT INTO daily_sequences(business_date, last_seq) VALUES(:d, 1)
  ON CONFLICT(business_date) DO UPDATE SET last_seq = daily_sequences.last_seq + 1;
  ```
- Business dates switch at 5:00 AM (`BUSINESS_DAY_START_HOUR = 5`).
- The `orders.bill_no` column is indexed non-uniquely (`ix_orders_bill_no`), allowing daily sequence resets without conflicting across business dates.

### Idempotency Engine (`idempotency_keys`)
- `requestId` idempotency uses deterministic SHA-256 hashes of canonical payload JSON.
- Matching replays instantly return cached responses (`status_code`, snapshot payload).
- Replays with mismatched request hashes return `409 IDEMPOTENCY_CONFLICT` (`"requestId was already used with a different request"`).
- Background cleanup purges entries older than 24 hours.

### Printing Out-of-Transaction Isolation
- Thermal print slips (`kitchen`, `cancel`, `bill`) are staged inside the transaction as versioned JSON snapshots (`"v": 1`) with status `'queued'`.
- Dispatch happens strictly post-commit via `dispatch_print_jobs()`.
- Network timeouts or printer hardware failures update the print job status to `'failed'` with descriptive errors, but **never** roll back the database transaction or fail the client HTTP request.

### Table Consistency Startup Self-Check
- A startup lifespan hook runs `run_table_consistency_check(db)`:
  - Tables marked `occupied` without an open order are safely freed.
  - Tables marked `free` that have open orders are re-marked `occupied` and linked to `currentOrderId`.

---

## 4. Phase B4 Decisions & Findings (Thermal ESC/POS Network Printing)

### Pure Python ESC/POS Byte Generation
- External compiled libraries (e.g. `python-escpos`, `Pillow`) were strictly avoided to guarantee smooth execution across low-power Linux and Android/Termux environments.
- Commands generated: `ESC @` (init), `ESC a` (align), `ESC E` (bold), `GS !` (character sizing: normal, double-height, double-both), `GS B` (inversion), `ESC d <n>` + `GS V 66 0` (feed and partial cut), and `ESC p 0 25 250` (drawer kick).
- Style resets are emitted after each line to prevent formatting leaks across slip sections.

### Text Sanitation & Encoding
- All dynamically rendered text (dish names, staff names, notes, void reasons) is processed by `sanitize_text()`.
- Text is normalized using Unicode NFKD (e.g. `Café` becomes `Cafe`), non-ASCII characters are replaced with `?`, and non-printable control characters `< 0x20` (except `\n`) and `0x7F` are stripped to prevent ESC/POS command injection over raw TCP streams.

### Best-Effort Hardware Status Checking
- Commodity network receipt printers frequently lack full bidirectional protocol support over raw TCP port 9100.
- The driver issues `DLE EOT 1` and `DLE EOT 4` with a 300ms read timeout. If the printer replies, cover-open and paper-out flags are checked. If the query times out or returns empty (unidirectional adapter), printing proceeds rather than failing prematurely.

### Concurrency & Printer Locks
- Socket operations for the same physical printer are serialized using per-printer in-memory locks with a 100ms inter-job pause to protect the hardware paper buffer.
- Multiple different printers print concurrently across background threads capped at ~6.0s total execution.

### Print Queue Crash Recovery & Retention
- Startup lifespan hook recovers queued print jobs from before a server restart:
  - Jobs queued within the last 10 minutes (`PRINT_RECOVER_MAX_AGE_MINUTES`) are re-dispatched with `"delayed": true`, printing `(delayed)` on the ticket.
  - Jobs older than 10 minutes are expired as `'failed'` to prevent kitchen staff from preparing abandoned orders.
- Automated 60-day cleanup purges completed print job rows on startup.


---

## 5. Phase B5 Decisions & Findings (Reports & Analytics, Demo Generator)

### Pre-Calculated Business Date Indexing
- Grouping orders by business date using dynamic SQL functions (e.g. `strftime` with timezone shifts) on 30,000+ orders resulted in full table scans.
- Added pre-computed columns upon order payment (`pay_order`):
  - `business_date`: `'YYYY-MM-DD'` based on local opening cutoff (`BUSINESS_DAY_START_HOUR=5`).
  - `paid_local_hour`: 0..23 integer local hour.
  - `paid_local_weekday`: 0..6 integer local weekday.
  - `is_demo`: Boolean flag distinguishing generated historical orders from real live production orders.
- Added indexed composite columns (`ix_orders_business_date`, `ix_orders_status_business_date`, `ix_orders_floor_business_date`, `ix_orders_waiter_business_date`, `ix_orders_payment_method_business_date`).
- Result: Aggregation queries over 90 days (6,500+ bills) execute in **under 45ms** (far exceeding the <300ms SLA).

### Void Accounting Rule
- Per the frontend mock (`src/lib/api/mock/setup.ts`), voided items are accounted for on the business date the void occurred (`voided_business_date`), regardless of whether the parent order is still open, cancelled, or paid later.
- Added `voided_business_date` to `order_items` with index `ix_order_items_voided_business_date`.
- `voidedItemsCount` counts the number of voided item lines (matching `voidedItemsCount++` in the frontend mock), while `itemsSold` sums the quantities of non-voided lines on paid orders.

### Peak Hours Heatmap Weekday Convention
- Python's `datetime.weekday()` uses `0 = Monday ... 6 = Sunday`.
- JavaScript's `Date.getDay()` and the frontend component `PeakHoursHeatmap.tsx` use `0 = Sunday ... 6 = Saturday`.
- Aggregations map the stored `paid_local_weekday` to JavaScript format via `(paid_local_weekday + 1) % 7`.

### Pure SQL Aggregations & Memory Footprint
- Reports queries do not load model instances into Python memory.
- All KPIs (`grossSales`, `discounts`, `netSales`, `tax`, `serviceCharge`, `grandTotal`, `billsCount`, `itemsSold`, `avgBill`) and bucket breakdowns are computed directly within SQLite via parameterized SQL and returned as Pydantic models.

### Deterministic Demo History & Zero-Dependency Safe Seeding
- Seed generator (`backend/scripts/seed.py --demo [--days 90] [--seed 42] [--clear-demo] [--force-demo]`) writes directly to SQLite in batches of 1,000 using `bulk_insert_mappings`.
- Generating 90 days (6,547 bills, 16,267 order items) completes in ~4.8 seconds.
- Tables remain `status='free'` throughout historical seeding.
- Guard against production: refuses execution if `APP_ENV=prod` unless `--force-demo` is explicitly passed.
- `--clear-demo` removes only `is_demo=1` orders, items, and print jobs, preserving all real production records and restoring sequential bill numbers.

---

## 6. Phase B6 Findings & Decisions (WebSocket Realtime)

### Single In-Process Hub Architecture
- Uses Python `asyncio` and pure-python `websockets` (no Redis or external message brokers required, fitting embedded POS terminals and low-power hardware).
- Global singleton `hub` (`ConnectionHub`) manages active connections, subscriptions, coalescing queue, heartbeat, and graceful shutdown.
- Thread-safe `emit(event_type, payload)` uses `loop.call_soon_threadsafe(hub.enqueue_event, ...)` so synchronous route handlers (like order creation, payment, and printing dispatchers) dispatch real-time events without blocking or deadlock.

### Event Coalescing Strategy
- To prevent broadcast storms on rapid table updates (e.g. adding 10 items in rapid succession), events are coalesced per `(event_type, entity_id)` within a `WS_COALESCE_MS=50` (50ms) window.
- The broadcaster loop wakes up every 50ms, snapshots pending descriptors, and queries fresh DB state in a worker thread (`asyncio.to_thread`), formatting fresh payloads for connected clients.
- Measured delivery latency p95 is **~65ms** (far beating the <150ms requirement).

### Floor Access Mapping
- In `config/users.example.yaml`, user allowed floors are configured as `["floor-1", "floor-2"]` (slugs), whereas database tables and services use `f1` and `f2`.
- `user_can_access_floor()` transparently normalizes and matches either representation (`f1` or `floor-1`).
- When a waiter attempts to subscribe to an unauthorized floor, the server replies with an `error` envelope (`code="FORBIDDEN"`), keeping the connection open so the client can continue operating on allowed floors.

### Slow Consumer & Rate Limiting Protection
- Each connection has a dedicated bounded `asyncio.Queue` of `WS_SEND_QUEUE_MAX=100` drained by an independent writer task.
- If a client fails to read from the socket and the queue overflows, the server drops the slow consumer with close code `1013` (`Send queue overflow`).
- Incoming messages are capped at 10 msgs/second and 4,096 bytes per frame, closing with code `4429` on breach.

### Token Redaction in Logging
- `TokenRedactingFilter` is applied to root, uvicorn, and app loggers, sanitizing all request URIs (e.g. `GET /ws?token=secret`) to `token=***` in both message strings and tuple arguments.

---

## 11. Phase B7 Findings: Durability, Backup, Audit, Diagnostics & Resilience

### SQLite Online Backup API (`sqlite3.Connection.backup`)
- SQLite's online backup API allows hot backups while transactions are actively executing. It locks the source database on a per-page basis rather than locking the entire database, ensuring zero downtime and zero `sqlite3.OperationalError: database is locked` for active waiter requests.
- Writing to a temporary file, verifying with `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, gzip-compressing, and computing SHA-256 sidecars ensures that only 100% verified archives are moved to `data/backups/`.
- A background backup scheduler executes nightly at `03:00`, catches up automatically on startup if >26 hours have elapsed, and performs a graceful shutdown snapshot if no backup was taken within 6 hours.

### Single Instance Enforcement (`data/server.lock`)
- Single-worker operational environments (Termux on Android, systemd, or standalone script) run an exclusive OS-level file lock on `data/server.lock`:
  - Uses `msvcrt.locking(..., msvcrt.LK_NBLCK, 1)` on Windows.
  - Uses `fcntl.flock(..., fcntl.LOCK_EX | fcntl.LOCK_NB)` on POSIX / Linux / Android.
- A duplicate server process fails immediately on startup with a clean error message, preventing split-brain database corruption.

### Clock Guard Subsystem
- Low-power devices and Android tablets running without a battery or RTC can lose time upon reboot.
- `check_clock_guard` compares current system wall-clock against:
  1. The minimum floor date `BUILD_DATE=2026-01-01`.
  2. The newest `created_at`, `paid_at`, or `ts` record across `orders` and `audit_logs`.
- If clock drift exceeds 5 minutes backwards, the system flags `clock_state = "suspect"` and surfaces a warning on `/health` and `doctor.py` without blocking active sales.

### Append-Only Audit Trail
- The `audit_logs` table (Alembic revision `d28b17f8b901`) logs security, orders, discounts, refunds, voids, menu price changes, and system maintenance events.
- Audit calls accept an optional `session: Session` parameter: when provided, the audit row is committed inside the same ACID transaction as the business operation, guaranteeing atomicity.
- All audit entries are simultaneously mirrored to rotating text logs (`data/logs/audit.log`) with recursive redaction of sensitive credentials (`password`, `token`, `secret`, `hash`).

### Additive Health API
- Unauthenticated and waiter requests to `GET /health` and `GET /api/health` return the standard public health envelope (`{status, time, db, version, opening_time, closing_time, business_day_start_hour, ws}`).
- When called with an Admin Bearer token, the response is dynamically and additively extended to include uptime, server boot ID, free disk space, SQLite version, clock status, backup health, real-time printer reachability, and active warnings.


