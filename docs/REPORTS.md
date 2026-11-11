# POS Reports & Analytics Documentation

This document describes the financial definitions, business day logic, API contracts, and CSV export formats used in the Restaurant POS reporting subsystem.

---

## 1. Financial Definitions & Business Rules

### 1.1 Inclusion Criteria
- **Only PAID orders** count towards sales metrics. An order is included only when `status === "paid"` and its grouping is based on its `paidAt` timestamp.
- **Open / Active orders** are strictly **excluded** from all sales reports. The Daily Closing report explicitly alerts the manager if active tables remain open.
- **Cancelled (Voided) items** are excluded from sales revenue and reported separately in the Cancellations & Discounts audit log.

### 1.2 Sales Calculations
- **Gross Sales**: The sum of all item line totals (`price * qty`) before any discounts, taxes, or service charges.
- **Discounts**: The total monetary value deducted from orders (either percentage discounts `(subtotal * percent / 100)` or flat cash discounts).
- **Net Sales**: Calculated as `Gross Sales - Discounts`.
- **Tax**: Government sales tax calculated on Net Sales (configured via `TAX_RATE` in `src/config/app.ts`).
- **Service Charge**: Optional dining service charge calculated on Net Sales (configured via `SERVICE_CHARGE_RATE` in `src/config/app.ts`).
- **Grand Total (Revenue)**: `Net Sales + Tax + Service Charge`. This represents the actual cash/card/online tender collected from patrons.
- **Average Bill**: `Grand Total / Bills Count`.

---

## 2. Business Day & Timezone Logic

- **Business Day Start Hour**: Configured as `BUSINESS_DAY_START_HOUR = 0` (midnight) in `src/config/app.ts`. If changed to 04:00 (4 AM) for late-night venues, sales between midnight and 04:00 AM are attributed to the previous calendar date.
- **Timezone**: Default timezone is `Asia/Karachi` (+05:00). All timestamps are stored in ISO 8601 UTC format and rendered in the local tablet timezone.

---

## 3. Reports API Endpoints

All endpoints support mock mode with a deterministic 90-day history generator seeded with over 6,000 real-world dining transactions across 2 floors, 3 waiters, and 16 menu items.

### Common Query Parameters
- `from` (string, `YYYY-MM-DD`): Start date (inclusive).
- `to` (string, `YYYY-MM-DD`): End date (inclusive).
- `floorId` (string, optional): `"f1"` (Halal), `"f2"` (Non-Halal), or `"all"`.
- `waiterId` (string, optional): Filter by user ID (`"u2"`, `"u3"`, `"u4"`).
- `paymentMethod` (string, optional): `"cash"`, `"card"`, or `"online"`.
- `categoryId` (string, optional): Filter by menu category.

### 3.1 Overview Summary
- **Endpoint**: `GET /reports/summary`
- **Response**: `ReportSummary` containing current period metrics, previous period comparison metrics, and percentage change.

### 3.2 Sales Over Time
- **Endpoint**: `GET /reports/sales-over-time`
- **Params**: `groupBy` (`"hour"` | `"day"` | `"month"`, auto-selected if omitted based on date range).
- **Response**: `SalesOverTimeBucket[]` (`bucket`, `grandTotal`, `billsCount`, `netSales`).

### 3.3 Menu & Categories
- **Endpoint**: `GET /reports/by-category`
- **Endpoint**: `GET /reports/top-items` (`limit`, `sort`, `order`)
- **Response**: `CategorySalesRow[]` and `TopItemRow[]`.

### 3.4 Staff & Payments
- **Endpoint**: `GET /reports/by-waiter`
- **Endpoint**: `GET /reports/by-floor`
- **Endpoint**: `GET /reports/by-payment-method`
- **Response**: Staff productivity, floor comparisons, and tender breakdown with revenue share percentages.

### 3.5 Cancellations & Discounts
- **Endpoint**: `GET /reports/discounts`
- **Endpoint**: `GET /reports/voided-items`
- **Response**: Full audit logs with timestamps, table numbers, waiter names, reasons, and amounts.

### 3.6 Daily Closing (Z-Report)
- **Endpoint**: `GET /reports/daily-closing`
- **Params**: `date` (`YYYY-MM-DD`), `floorId` (optional).
- **Response**: `DailyClosingReport` including first/last bill timestamps, tender reconciliation, floor breakdown, top items, and open tables warning count.

---

## 4. CSV Export Format

All CSV downloads are generated client-side using `src/lib/export/csv.ts`:
- **Encoding**: UTF-8 with Byte Order Mark (`\uFEFF`) to ensure seamless opening in Microsoft Excel on Windows without character corruption.
- **Naming Convention**: `pos-report-{type}_{from}_to_{to}.csv`.
- **Formatting**: Proper cell quoting and RFC 4180 escaping for commas and double-quotes.

