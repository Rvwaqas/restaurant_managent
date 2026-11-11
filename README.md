# Soufi Restaurant POS — Tablet-First Point of Sale

A production-grade, tablet-first restaurant Point of Sale and manager administration system built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, **Zustand**, and resilient **Axios services** with deterministic mock capability.

Designed for standing waiters and managers on 10" touch tablets (1024×768 landscape primary, 768×1024 portrait secondary) operating mid-rush.

---

## 🚀 Quick Start

```bash
# 1. Clone & install dependencies
git clone <repo-url>
cd Freelancher_01
npm install

# 2. Start local development server
npm run dev

# 3. Open in tablet browser or Chrome DevTools (1024x768)
http://localhost:3000
```

---

## 🔑 Default Mock Credentials (Development Only)

All authentication is role-guarded with no public signup or customer accounts:

| Username | Password | Role | Allowed Floors | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `admin` | `admin123` | **Admin / Manager** | All Floors | Full access to menu, tables, printers, bills audit, reports, and discounts |
| `waiter1` | `1234` | **Waiter** | All Floors | Ali Khan — Order entry & kitchen slip dispatch |
| `waiter2` | `1234` | **Waiter** | All Floors | Zainab Ahmed — Order entry & kitchen slip dispatch |
| `waiter3` | `1234` | **Waiter** | Floor 1 Only | David Chen — Restricted to Floor 1 (Halal) |

---

## 🛠️ Tech Stack & Architecture

- **Framework**: Next.js 15.2.4 (App Router) + React 19
- **Type Safety**: TypeScript 5 (Strict Mode, zero implicit `any`)
- **Styling**: Tailwind CSS 3.4 with custom ergonomic tokens (min 48px touch targets)
- **Component Primitives**: Radix UI / shadcn/ui + Lucide Icons
- **State Management**: Zustand 5 with persisted stores (`localStorage`) and auto-purging drafts
- **Networking & Resilience**: Axios with request deduplication, GET auto-retry (max 2), abort controllers, and global connection health monitoring (`connectionStore`)
- **Mock Service Layer**: `axios-mock-adapter` with 90-day deterministic transactional seed generator (~6,000 bills)
- **Charts & Reporting**: Recharts lazy-loaded with `next/dynamic` (`ssr: false`)
- **PWA & Device**: Service Worker with static caching, Screen Wake Lock API, Web Audio tone feedback, and Haptics (`navigator.vibrate`)
- **Testing**: Vitest + React Testing Library + Playwright E2E tablet tests

---

## 📁 Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/login/           # Staff PIN / credentials login
│   ├── (waiter)/[floor]/       # Waiter floor table grid & order terminal
│   │   └── table/[tableId]/    # Menu catalog, draft cart, kitchen slip dispatch & pay
│   ├── (admin)/admin/          # Manager overview dashboard
│   │   ├── menu/               # Categories, dishes CRUD, WebP optimizer, floor duplication
│   │   ├── tables/             # Floor table layout, capacity steppers, bulk generation
│   │   ├── printers/           # IP/port RAW 9100 thermal printers management
│   │   ├── bills/              # Paid transactions audit, cashier reprint, search
│   │   └── reports/            # Analytics: Overview, Sales, Items, Staff, Discounts, Closing
│   ├── 403/                    # Forbidden access screen
│   ├── offline/                # Offline PWA fallback page
│   ├── manifest.ts             # Web App Manifest
│   └── globals.css             # Design tokens, print styles, tablet gestures
├── components/                 # UI Components
│   ├── common/                 # ErrorView, ConnectionBanner, ConnectionPill
│   ├── layout/                 # Top bar, DeviceSettingsSheet, AutoLockOverlay
│   ├── cart/                   # CartPanel, SendResultSheet, PaymentSheet
│   ├── reports/                # SalesChart, PeakHoursHeatmap, CategoryDonut, TopItemsBar
│   └── slips/                  # Monospace 80mm thermal slips (Kitchen, Cashier, Closing)
├── config/                     # Application, environment, and string constants
├── lib/                        # Axios client, mock engine, CSV exporter, device feedback
├── store/                      # Zustand state stores (auth, cart, order, tables, reports, etc.)
├── types/                      # Comprehensive TypeScript definitions
└── utils/                      # Currency formatting (`formatMoney`) and calculations
```

---

## ⚙️ Available Scripts

```bash
npm run dev           # Start Next.js development server
npm run build         # Build optimized production bundle
npm run start         # Start production server
npm run check         # Comprehensive CI check (colors, tsc, lint, vitest, build)
npm run check:colors  # Enforce design tokens & table status color reservations
npm run test          # Run Vitest unit & integration test suite
npm run test:e2e      # Run Playwright tablet touch test suite
npm run analyze       # Run @next/bundle-analyzer to inspect production chunks
```

---

## 🛡️ Design System & Color Semantics Rules

- **Strict Color Semantics**: Red (`#DC2626`) and Green (`#16A34A`) are **strictly reserved** for table status only (Green = Free, Red = Occupied). They are never used for standard buttons, icons, or decorative elements.
- **Brand Primary**: Indigo (`#4F46E5`).
- **Touch Target Standard**: All primary interactive buttons, chips, and table cards enforce a **minimum 48px touch height** to ensure reliable standing tablet operation.
- **Accidental Gestures**: Pull-to-refresh, double-tap zoom, and long-press context menus are disabled via CSS touch-action and overscroll rules.

---

## 📖 System Documentation

Detailed technical documentation is available in the [`docs/`](file:///f:/29-oct-2026/Freelancher_01/docs/) directory:
- [`docs/AUTH.md`](file:///f:/29-oct-2026/Freelancher_01/docs/AUTH.md) — Authentication flow, credentials, token guards
- [`docs/REPORTS.md`](file:///f:/29-oct-2026/Freelancher_01/docs/REPORTS.md) — Accounting definitions, business day logic, reports API contracts
- [`docs/PWA.md`](file:///f:/29-oct-2026/Freelancher_01/docs/PWA.md) — Progressive Web App, Service Worker caching, LAN HTTP vs HTTPS
- [`docs/DEPLOYMENT.md`](file:///f:/29-oct-2026/Freelancher_01/docs/DEPLOYMENT.md) — Deployment architectures, Docker, static export, and hardware options
- [`docs/F9_REPORT.md`](file:///f:/29-oct-2026/Freelancher_01/docs/F9_REPORT.md) — Production polish audit checklist and verification log
- [`docs/backend/PRINTING.md`](file:///f:/29-oct-2026/Freelancher_01/docs/backend/PRINTING.md) — Real thermal ESC/POS network printing guide, hardware calibration, CLI diagnostics
- [`docs/backend/OPERATIONS.md`](file:///f:/29-oct-2026/Freelancher_01/docs/backend/OPERATIONS.md) — Day-to-day operations guide, backup/restore procedures, disaster recovery, and CLI reference
- [`docs/backend/REALTIME.md`](file:///f:/29-oct-2026/Freelancher_01/docs/backend/REALTIME.md) — Realtime WebSocket architecture, canonical envelope, event protocol, and close codes
- [`docs/backend/FRONTEND_WS_SPEC.md`](file:///f:/29-oct-2026/Freelancher_01/docs/backend/FRONTEND_WS_SPEC.md) — Specification and roadmap for frontend Phase B9 WebSocket switchover
- [`docs/backend/REPORTS.md`](file:///f:/29-oct-2026/Freelancher_01/docs/backend/REPORTS.md) — Reports & Analytics engine architecture, SLA benchmarks, query optimization
- [`docs/backend/FINDINGS.md`](file:///f:/29-oct-2026/Freelancher_01/docs/backend/FINDINGS.md) — Backend architectural alignments, schema additions & findings

---

## 🐍 Python FastAPI Backend (`backend/`)

The production backend is located in `/backend` and built with **FastAPI**, **SQLite** (WAL mode), **SQLAlchemy 2.0**, and **Alembic**:

### Running the Backend

```bash
# 1. Start the FastAPI server
cd backend
python -m uvicorn app.main:app --port 8000 --reload

# 2. Run Alembic migrations
python -m alembic -c backend/alembic.ini upgrade head

# 3. Run Pytest suite (103 tests covering B1–B8)
python -m pytest backend/tests --timeout=120 -q

# 4. Code Quality & Linting
python -m ruff check backend/app scripts
python -m mypy scripts
```

### Operations, Backups & Maintenance CLI Tools (`scripts/`)
- `python scripts/doctor.py` — Run full system diagnostic & readiness inspection
- `python scripts/backup.py [--reason manual]` — Perform online SQLite backup with SHA-256 sidecar
- `python scripts/list_backups.py` — View all available backups, timestamps, age, and integrity status
- `python scripts/verify_backup.py <filename>` — Decompress, verify integrity & FK pragmas, inspect order statistics
- `python scripts/restore.py <filename> [--yes]` — Overwrite-safe database restore with safety copy & server-lock check
- `python scripts/reset_business_data.py [--yes]` — Purge transactions for opening day while keeping menu/tables/users
- `python scripts/export_bills.py --from YYYY-MM-DD --to YYYY-MM-DD [--format csv|json] [--out file]` — Export bills (Excel UTF-8 BOM)
- `python scripts/check_users.py` — Validate `users.yaml` structure, roles, and scrypt hash formats
- `python scripts/tail_audit.py [-n 25] [--event <name>]` — Inspect audit trail records with credential redaction
- `python scripts/gen_secret.py` — Generate cryptographically secure JWT/secret keys

### Real-Time WebSocket Gateway (`/ws` & `/api/ws`)
- `python scripts/ws_watch.py --username admin --password admin123 --floor f1` — Real-time event streaming CLI watcher
- Built on pure-Python `websockets` + `asyncio` Connection Hub (no Redis required)
- Supports granular floor subscriptions, event coalescing (50ms window, p95 latency ~65ms), role visibility enforcement, and automatic log token redaction (`token=***`)

### Database Seeding & Deterministic Demo History
- `python scripts/seed.py --init` — Seed master data (floors, tables, menu, printers)
- `python scripts/seed.py --demo --days 90` — Generate 90 days of deterministic historical bills (~6,500 orders)
- `python scripts/seed.py --demo --days 30 --seed 1234` — Custom period and seed replay
- `python scripts/seed.py --clear-demo` — Safely purge demo records and restore sequence numbers without affecting real orders
- `python backend/scripts/verify_b5_reports_api.py` — Run full reports verification against live backend (27 checks)

### Thermal Printing CLI Tools
- `python backend/scripts/preview_slip.py --sample kitchen|cancel|bill|test [--columns 48]` — Monospace preview in terminal
- `python backend/scripts/print_test.py --printer <id|ip> [--port 9100]` — Trigger test slip to hardware
- `python backend/scripts/printer_status.py --printer <id|ip> [--port 9100]` — Live hardware (DLE EOT) & health inspection

### Backend Settings (`.env` or environment variables)
- `DATABASE_URL`: SQLite connection string (`sqlite:///./pos.db`).
- `PRINT_MODE`: `"simulate"` (default) or `"network"` (direct TCP socket to printer port 9100 with 2s timeout).
- `SIMULATE_FAIL_PRINTERS`: Comma-separated printer IDs to simulate network failure (e.g. `"p1,p2"`).
- `UPLOAD_DIR`: Target directory for image uploads (`"backend/uploads"`).
- `PUBLIC_BASE_URL`: Optional server base URL for image delivery (e.g. `"http://192.168.1.50:8000"`; inferred from request host if unset).

### Frontend Switch-Over
To run the frontend against the live FastAPI server instead of the mock layer:
```env
# .env.local
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_WS_ENABLED=true
```

