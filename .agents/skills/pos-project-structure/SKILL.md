---
name: pos-project-structure
description: Architecture, routing conventions, folder structure, design tokens, and state management guidelines for the Restaurant POS Next.js App Router application.
---

# Restaurant POS Next.js App Router Architecture

This skill defines the official architectural structure, conventions, design system tokens, and tablet ergonomic constraints for the Restaurant POS project. Always adhere to these patterns when creating or modifying features.

---

## 1. Directory Structure (`src/` Layout)

```
Freelancher_01/
├── docs/
│   └── api/                                 # Authoritative Backend API Contract & Specs (Task F10)
│       ├── API_CONTRACT.md                  # Comprehensive Human-Readable API Specification
│       ├── openapi.yaml                     # OpenAPI 3.1 Specification (Validated)
│       ├── DATA_MODEL.md                    # Relational SQLite Schema & Mermaid ER Diagram
│       ├── BACKEND_PLAN.md                  # Step-by-Step FastAPI Implementation Roadmap (B1-B10)
│       └── fixtures/                        # Live Recorded Request/Response JSON Fixtures
├── src/
│   ├── app/                                 # Next.js App Router root
│   │   ├── (auth)/                          # Route group: Authentication
│   │   │   ├── layout.tsx                   # Centered branding card layout
│   │   │   └── login/page.tsx               # Login screen
│   │   ├── (waiter)/                        # Route group: Waiter ordering screens (NO sidebar!)
│   │   │   ├── layout.tsx                   # Slim 64px top bar, FloorTabs, WiFi status, user menu
│   │   │   └── [floor]/page.tsx             # Multi-floor routing (/floor-1 Halal, /floor-2 Non-Halal)
│   │   ├── (admin)/                         # Route group: Administration
│   │   │   ├── layout.tsx                   # 240px collapsible sidebar, top bar
│   │   │   ├── menu/page.tsx                # Menu management per floor
│   │   │   ├── tables/page.tsx              # Table configuration per floor
│   │   │   ├── printers/page.tsx            # Network printer mapping
│   │   │   └── reports/page.tsx             # Financial & analytics reports
│   │   ├── dev/
│   │   │   ├── ui/page.tsx                  # Component & Design System Showcase (768/1024/1280 frames)
│   │   │   └── api-check/page.tsx           # API & Mock verification test suite
│   │   ├── globals.css                      # Tailwind tokens, touch manipulation, print styles
│   │   ├── layout.tsx                       # Clean root shell with viewport & Toaster
│   │   └── page.tsx                         # Landing page with floor selectors
│   ├── components/                          # Domain & UI components
│   │   ├── ui/                              # Primitives (Button, Input, SearchInput, Select, Switch, Badge, StatusBadge, QuantityStepper, ConfirmDialog, DataTable, Skeletons)
│   │   ├── layout/                          # Layout shells (OrderLayout, FloorTabs, Header, SidebarNav)
│   │   ├── tables/                          # TableCard (large min 140x120px)
│   │   ├── menu/                            # MenuItemCard, CategoryChips
│   │   ├── cart/                            # CartPanel, CartLine, BottomActionBar
│   │   ├── admin/                           # Admin modules (menu, tables, printers)
│   │   ├── reports/                         # Analytics charts & summary cards
│   │   └── slips/                           # Thermal receipt & KOT slip generators
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                    # Central Axios client with token & error interceptors
│   │   │   ├── endpoints.ts                 # Strongly typed endpoint paths
│   │   │   ├── services/                    # Domain API service modules (auth, floors, tables, etc.)
│   │   │   └── mock/                        # In-memory mock adapter & seed data
│   │   └── utils.ts                         # Utility functions (cn)
│   ├── store/                               # Zustand client state stores
│   │   ├── authStore.ts                     # Auth session & credentials
│   │   ├── tablesStore.ts                   # Floor tables & status tracking
│   │   ├── menuStore.ts                     # Categories & dishes cache
│   │   ├── cartStore.ts                     # Draft cart items keyed by tableId
│   │   ├── uiStore.ts                       # Sidebar & modal UI states
│   │   └── index.ts                         # Barrel export
│   ├── types/                               # TypeScript domain definitions
│   │   └── index.ts                         # Strict interfaces (Floor, Table, Order, etc.)
│   ├── hooks/                               # Custom React hooks
│   ├── config/                              # Configuration constants
│   │   ├── app.ts                           # APP_NAME, TAX_RATE, currency
│   │   └── env.ts                           # Validated environment variables
│   └── utils/                               # Helper utilities
├── public/                                  # Static assets & PWA files
├── .env.example                             # Example environment configuration
├── .env.local                               # Local environment overrides
├── next.config.mjs                          # Next.js configuration
├── tailwind.config.ts                       # Tailwind theme tokens
└── tsconfig.json                            # TypeScript configuration with @/* mapped to src/*
```

---

## 2. Design Tokens & Tablet Ergonomics (F2 Standard)

### Color Palette
- **Background:** `#F5F6FA`
- **Surface:** `#FFFFFF`
- **Border:** `#E5E7EB`
- **Text:** `#111827`, Muted: `#6B7280`
- **Primary Brand:** Indigo (`#4F46E5`, hover `#4338CA`, soft `#EEF2FF`)
- **Status Colors STRICTLY RESERVED for entity state:**
  - `free`: green (`#16A34A`, soft `#DCFCE7`, border `#86EFAC`)
  - `occupied`: red (`#DC2626`, soft `#FEE2E2`, border `#FCA5A5`)
  - `open`/`warning`: amber (`#D97706`, soft `#FEF3C7`)
  - `paid`/`info`: blue (`#2563EB`, soft `#DBEAFE`)
  - **Rule:** Never use red/green for regular buttons or decorative accents.

### Touch Targets & Sizing
- **Minimum Touch Target:** $\ge 48\times 48\text{px}$ everywhere (`h-12` or larger).
- **Buttons:**
  - `md`: 48px (`min-h-[48px]`)
  - `lg`: 56px (`min-h-[56px]`)
  - `xl`: 64px (`min-h-[64px]`)
- **Press Feedback:** `active:scale-[0.98]` with 150ms transitions.
- **Touch Manipulation:** `touch-action: manipulation`, disable double-tap zoom, `-webkit-tap-highlight-color: transparent`.
- **Chrome User-Select:** `user-select: none` on interactive chrome (buttons, headers, chips), `user-select: text` on inputs.
- **Numbers:** `tabular-nums` for prices and elapsed timers.

---

## 3. Layout Conventions

1. **Root Layout (`src/app/layout.tsx`):**
   - Clean shell without hardcoded headers or sidebars. Contains `<Toaster />`, fonts, and mobile viewport properties (`maximumScale: 1, userScalable: false`).
2. **Auth Layout (`src/app/(auth)/layout.tsx`):**
   - Centered card on `#F5F6FA` with `APP_NAME` and restaurant branding icon.
3. **Waiter Layout (`src/app/(waiter)/layout.tsx`):**
   - Slim 64px top bar (`h-16`).
   - **NO sidebar:** Waiters need maximum screen width mid-rush.
   - Contains `FloorTabs` (`/floor-1` HALAL and `/floor-2` NON-HALAL), WiFi status pulse indicator, and user menu.
4. **Order Split Screen (`src/components/layout/order-layout.tsx`):**
   - **Landscape ($\ge 1024\text{px}$):** 2 columns. Left column = scrollable menu items & category chips. Right column = fixed-width cart panel ($\approx 380\text{px}$) with bottom action bar.
   - **Portrait ($< 1024\text{px}$):** Full-width menu + floating bottom bar opening `CartPanel` inside a bottom `Drawer`.
5. **Admin Layout (`src/app/(admin)/layout.tsx`):**
   - 240px collapsible sidebar (folds to icon rail on narrower screens), management links (Menu, Tables, Printers, Reports), top bar.

---

## 4. Core Architectural Rules

### Rule 1: Services-Only API Access
- **Components must NEVER call Axios or `fetch` directly.**
- Remote data interactions must go through `src/lib/api/services/`.

### Rule 2: Zustand for Client State
- React state across routes is managed via Zustand stores in `src/store/`:
  - `authStore`: User token, active profile, login/logout.
  - `tablesStore`: Tables per floor, real-time status updates.
  - `menuStore`: Categories and dish catalog per floor.
  - `cartStore`: Unsent draft items mapped by `tableId`.
  - `uiStore`: Sidebar collapse, navigation toggles.

### Rule 3: Mock Mode Flag
- When `NEXT_PUBLIC_USE_MOCK=true`, the `axios-mock-adapter` in `src/lib/api/mock/` intercepts all requests and operates on in-memory seed state.

### Rule 4: Thermal Receipt & KOT Slips
- Kitchen printing routes category items to separate IP network printers (Sweet slip to sweet printer, Spicy slip to spicy printer).
- Thermal slips are formatted for 80mm / 58mm thermal printers with `@media print` isolation.

---

## 5. Authentication & Role-Based Access Control (F3 Standard)

### Hardcoded Credentials (DEV ONLY)
- `admin` / `admin123` (Admin: full system & floor access)
- `waiter1` / `1234` (Waiter: full floor access)
- `waiter2` / `1234` (Waiter: full floor access)
- `waiter3` / `1234` (Waiter: restricted to `floor-1` only)

### Session & Cookie Mirroring
- Frontend is credential-agnostic. Tokens are received via `POST /api/auth/login`.
- Session mirrored to client cookies: `pos_token` and `pos_role` with `path=/; SameSite=Lax`.
- Next.js Edge Middleware (`src/middleware.ts`) protects routes using these cookies.
- Client double protection: `<RoleGuard>` and `useRequireAuth()` check Zustand state, prevent hydration flashes with `<LoadingScreen />`, and enforce floor restrictions.

---

## 6. Table Grid & Real-Time Sync (F4 Standard)

### Routing Conventions
- `src/app/(waiter)/[floor]/page.tsx`: Waiter home grid, validates `floorSlug` (`floor-1` | `floor-2`). Waiters with restricted `allowedFloors` are redirected to `/403`.
- `src/app/(waiter)/[floor]/table/[tableId]/page.tsx`: Table detail & order screen. Loads table via `tablesService.getById(tableId)` and verifies it belongs to `floor.id`.

### Sync Interface (`TablesSyncService`)
- Interface in `src/lib/realtime/tablesSync.ts` with `subscribe(floorId, onUpdate, onError)`.
- Current transport: 5-second polling, auto-paused when document is hidden, immediate wakeup on visibility/online.
- Future transport: WebSocket / SSE without changing frontend consumers.
- Consumer hook: `useTablesSync(floorId)` manages network offline detection (2 consecutive failures -> offline banner).
- `tablesStore`: Maintains `items[floorId]`, `changedTableIds` (triggers 1.5s highlight pulse when another tablet updates a table), and live `counts(floorId)`.


---

## 7. Order Management, Kitchen Dispatch & KOT Printing (F5 Standard)

### Order Screen Layout
- `OrderLayout` in `src/components/layout/order-layout.tsx`:
  - Landscape ($\ge 1024\text{px}$): 2-column split with catalog on left and fixed $380\text{px}$ `CartPanel` on right.
  - Portrait ($< 1024\text{px}$): Full-width catalog with floating bottom bar opening a bottom sheet drawer.
  - Min touch target $48\text{px}$ throughout.

### Cart State & Idempotency
- `cartStore` (`src/store/cartStore.ts`):
  - Draft items keyed by `tableId`. Persists to localStorage, auto-purges after 12 hours.
  - Client UUID `requestId` generated on draft creation.
  - Drafts represent unsent items only.
  - Prices are NOT stored in the cart; `draftSubtotal` dynamically computes amounts from `menuStore` at render time.
- `orderStore` (`src/store/orderStore.ts`):
  - Tracks open order on server for viewed table.
  - Silently refreshes every 10 seconds via `ordersService.getOpenByTable(tableId)`.
  - Splits cart into "Already sent" batches (read-only, lock icon) and "New items" draft.

### Kitchen Slip Dispatch & Resilience
- `ordersService.sendItems`:
  - Accepts `{ tableId, requestId, items }`.
  - Creates open order on free table (table status turns red/occupied) or appends `batchNo + 1`.
  - Dispatches `PrintJob[]` per category to mapped network printers.
  - Idempotent: duplicate `requestId` returns cached `SendResult` without duplicate items or print jobs.
- `SendResultSheet` (`src/components/cart/send-result-sheet.tsx`):
  - Displays batch #, order running total, and print jobs.
  - Failed printers displayed with warning amber (never red) and "Retry" button calling `ordersService.reprint`.
  - "Preview KOT Slip" opens `KitchenSlipModal` with standard 80mm monospace thermal ticket layout.

### Currency & Money Formatting
- `formatMoney` (`src/utils/money.ts`): All currency values formatted with `CURRENCY_SYMBOL` (`Rs`).


---

## 8. Payment, Settlement, and Cashier Operations (F6 Standard)

### Payment Workflow & Table De-escalation
- `PaymentSheet` in `src/components/cart/payment-sheet.tsx`:
  - 48px+ touch ergonomic controls.
  - Consolidated view of active items, subtotal, tax, service charge, and discounts.
  - Cash payment validation: requires `amountReceived >= total` with quick-amount chips (`Exact`, `500`, `1000`, `2000`, `5000`) and live change calculation.
  - Manager Discount (Admin only): Amount (`Rs`) and Percent (`%`) options.
- On payment confirmation:
  - Table transitions from `"occupied"` (Red) to `"free"` (Green) instantly across all tablets.
  - Assigned daily sequential bill number (`B-0001`, `B-0002`...).
  - Cashier thermal printer job dispatched for 80mm bill receipt.
  - `PaymentResultSheet` presents settlement confirmation and receipt preview.

### Item Cancellation / Voids (Admin Only)
- Admin can cancel previously sent items via `VoidItemDialog`.
- Requires cancellation reason. Dispatches cancellation ticket to kitchen station.
- Voided items are rendered with amber badge and struck-through, dynamically excluded from bill totals.
- Waiters do not have access to cancellation controls (403 forbidden).

### Admin Bills Management
- Route: `src/app/(admin)/admin/bills/page.tsx`
- Features: `DataTable` of paid bills, filters (date, floor, payment method, search by bill #), KPI revenue summary, slip preview modal (`BillSlipModal`), and cashier slip reprint.

---

## 9. Admin Management: Menu, Tables & Hardware (F7 Standard)

### Menu Management (`/admin/menu`)
- Multi-floor segmented tabs: Floor 1 (Halal) vs Floor 2 (Non-Halal).
- Category CRUD with `@dnd-kit` drag-and-drop ordering, item counts, active switch, and target printer selection.
- 409 conflict protection: Categories with active items cannot be deleted. Categories with past orders are soft-deleted.
- Dishes CRUD with client-side canvas WebP resizing to 600px max dimension.
- Optimistic availability switch ("Available" vs "Sold out") and visibility switch ("Active in POS").
- Dish duplication across floors with target category selection.
- Bulk dish actions: Mark available, Mark sold out, Delete selected.
- Dual view toggle: Responsive Cards Grid vs Dense Table View.

### Table Layout (`/admin/tables`)
- Live occupancy indicators (green for Free, red dot for Occupied) and running bill display.
- 10-second silent polling for multi-tablet synchronicity.
- Inline capacity stepper (`+` and `-`) for rapid seat updates.
- Bulk range generator with live preview skipping existing table numbers.
- Deletion safety: Occupied tables cannot be deleted (HTTP 409); tables with order history are soft-deleted.

### Network Thermal Printers (`/admin/printers`)
- RAW socket port 9100 configuration with IPv4 validation.
- Role definition: `kitchen` (order category slips) vs `cashier` (bill receipt slips).
- Cashier printer validation banner enforcing exactly 1 active cashier printer.
- Category dependency safeguard: 409 error prevents deleting printers assigned to active food categories.
- Direct test print dispatch with simulated failure toggle for resilience testing.

### Overview Dashboard (`/admin`)
- KPI summary tiles: Today's sales, paid bills audit count, active table occupancy, printer health.
- Quick navigation tiles to all admin modules and direct waiter floor launching.

---

## 10. Reports & Analytics Subsystem (F8 Standard)

### Core Rules & Calculation Consistency
- **Paid Orders Only**: Only completed transactions (`status === "paid"`) are included in sales reports, bucketed by `paidAt`.
- **Open Orders Excluded**: Active tables are strictly excluded from sales numbers; Daily Closing displays an amber alert if open tables remain.
- **Cancelled/Voided Items Excluded**: Voids are excluded from revenue totals and logged separately.
- **Strict Color Semantics**: Red and green are strictly reserved for table occupancy status only. Reporting charts and trend indicators use primary indigo for positive series/trends and gray/amber for negative/warning.

### Architecture & Navigation (`/admin/reports`)
- **Shared Filter Bar** (`ReportFilterBar`): Sticky header with presets (Today, Yesterday, Last 7 days, This month, Last month, Custom range), floor filter (All / Floor 1 / Floor 2), staff / payment / category filters, and URL query synchronization.
- **Lazy Loaded Charts**: Recharts visualizations (`SalesChart`, `CategoryDonut`, `TopItemsBar`, `PeakHoursHeatmap`) lazy-loaded via `next/dynamic` (`ssr: false`).
- **Reports Tabs**:
  1. `/admin/reports` (Overview): 6 KPI stat cards with previous period percentage change, sales over time area chart, top dishes, category donut, floor split, and payment distribution.
  2. `/admin/reports/sales`: Revenue & bills trends grouped by hour/day/month, 7x24 peak operating hours heatmap, and period records table with grand total sum.
  3. `/admin/reports/items`: Top selling dishes (toggle by quantity/revenue), category performance table with multi-column sorting, and slow sellers list.
  4. `/admin/reports/staff`: Waiter productivity metrics (bills, dishes sold, average ticket, revenue share) and payment method breakdown with progress bars.
  5. `/admin/reports/cancellations`: Discounts audit log (bill #, table, waiter, discount type/value) and cancelled items log with grouping by cancellation reason.
  6. `/admin/reports/closing`: Daily Closing (Z-Report) with first/last bill timestamps, tender breakdown, open tables alert, print to 80mm thermal slip (`ClosingSlip`), and CSV export.
- **CSV Export Engine** (`src/lib/export/csv.ts`): Client-side UTF-8 BOM encoding for seamless Windows Excel compatibility.
