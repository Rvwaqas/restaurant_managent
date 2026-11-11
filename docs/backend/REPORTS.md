# Reports & Analytics Architecture (Phase B5)

This document provides the definitive architectural reference, business rules, API schemas, and performance benchmarks for the Soufi Restaurant POS Reports & Analytics engine.

---

## 1. Business Definitions & Principles

All report calculations strictly mirror the frontend mock layer (`src/lib/api/mock/setup.ts`, `reportsSeed.ts`):

1. **Sales Inclusion**:
   - Only orders with `status = 'paid'` are included in sales revenue and KPIs.
   - Open, submitted, or cancelled orders are strictly excluded from sales metrics.
2. **Business Day Boundary**:
   - The restaurant operating day starts at `BUSINESS_DAY_START_HOUR = 5` local time (`Asia/Karachi`).
   - A bill paid at `04:59:59` on November 7 belongs to business date `2026-11-06`.
   - A bill paid at `05:00:00` on November 7 belongs to business date `2026-11-07`.
   - Stored in the database as `orders.business_date` (`YYYY-MM-DD`).
3. **Financial Formulas**:
   - **Gross Sales** = $\sum (\text{item.price} \times \text{item.qty})$ for all non-voided item lines.
   - **Discounts** = $\sum \text{order.discount}$.
   - **Net Sales** = $\text{Gross Sales} - \text{Discounts}$.
   - **Tax** = $\sum \text{order.tax}$ (currently $0.0$).
   - **Service Charge** = $\sum \text{order.service\_charge}$ (currently $0.0$).
   - **Grand Total** = $\text{Net Sales} + \text{Tax} + \text{Service Charge}$ (actual cash/electronic revenue collected).
   - **Average Bill** = $\text{Grand Total} / \text{Bills Count}$ ($0$ if no bills).
   - **Items Sold** = $\sum \text{item.qty}$ for all non-voided lines on paid orders.
4. **Void Accounting**:
   - A voided item is attributed to the business date it was voided (`order_items.voided_business_date`), regardless of whether the parent order is currently open or paid later.
   - Voided lines are strictly excluded from all sales calculations, gross sales, and item counts.
   - `voidedItemsCount` is the count of voided item lines, and `voidedAmount` is the sum of $(\text{price} \times \text{qty})$ of those voided lines.
5. **Comparison Period**:
   - Comparing $[D_{\text{from}}, D_{\text{to}}]$ of length $N$ days sets the comparison window to $[D_{\text{from}} - N\text{ days}, D_{\text{from}} - 1\text{ day}]$.
   - Change percentages: $\frac{\text{current} - \text{previous}}{\text{previous}} \times 100$. If previous $= 0$, change percent is $0.0$.
6. **Weekday Conventions**:
   - In peak hours heatmap, weekday uses JavaScript indexing: $0 = \text{Sunday}, 1 = \text{Monday}, \dots, 6 = \text{Saturday}$.

---

## 2. API Endpoints Reference

All report endpoints reside under `/api/reports/` and are **Admin Only** (401 without Bearer token, 403 for Waiters):

| Method | Endpoint | Query Parameters | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/summary` | `from`, `to`, `floorId`, `waiterId`, `paymentMethod`, `categoryId` | Headline KPIs (gross, net, discounts, grand total, items sold, voided) with comparison period |
| `GET` | `/api/reports/sales-over-time` | `from`, `to`, `groupBy` (`auto` \| `hour` \| `day` \| `month`), `floorId`, `waiterId`, `paymentMethod`, `categoryId` | Time-bucketed sales for sparklines and bar charts; auto-fills empty buckets with 0 |
| `GET` | `/api/reports/by-category` | `from`, `to`, `floorId`, `waiterId`, `paymentMethod` | Gross sales, item quantities, and share percentage per category |
| `GET` | `/api/reports/top-items` | `from`, `to`, `limit` (1..100), `sort` (`qty` \| `amount`), `order` (`asc` \| `desc`), filters | Dish rankings with quantity sold, revenue, and category/floor metadata |
| `GET` | `/api/reports/by-waiter` | `from`, `to`, `floorId`, `paymentMethod`, `categoryId` | Staff performance breakdown with bill counts, revenue, and share percentage |
| `GET` | `/api/reports/by-floor` | `from`, `to`, `waiterId`, `paymentMethod`, `categoryId` | Floor comparisons (`f1` Halal vs `f2` Non-Halal) |
| `GET` | `/api/reports/by-payment-method` | `from`, `to`, `floorId`, `waiterId`, `categoryId` | Breakdown by `cash`, `card`, `online` |
| `GET` | `/api/reports/peak-hours` | `from`, `to`, filters | 2D heatmap matrix (weekday 0..6 $\times$ hour 0..23) with bill counts and revenue |
| `GET` | `/api/reports/discounts` | `from`, `to`, filters | Chronological audit trail of all discounted orders with staff and table metadata |
| `GET` | `/api/reports/voided-items` | `from`, `to`, filters | Chronological audit trail of cancellations with reason, staff member, and timestamp |
| `GET` | `/api/reports/daily-closing` | `date` (`YYYY-MM-DD`), `floorId` | End-of-day register closure summary, opening/closing timestamps, and open tables warning |
| `GET` | `/api/reports/daily-sales` | `from`, `to`, `floorId` | Legacy daily breakdown endpoint |
| `GET` | `/api/reports/category-sales`| `from`, `to`, `floorId` | Legacy category breakdown endpoint |
| `GET` | `/api/reports/waiter-sales` | `from`, `to` | Legacy waiter breakdown endpoint |

---

## 3. Database Schema & Query Optimization

Alembic migration `c19d28e74a01_b5_reports_and_demo_fields.py` added pre-calculated fields and composite indexes:

### Pre-Calculated Fields
- `orders.business_date` (`VARCHAR(10)`, indexed)
- `orders.paid_local_hour` (`INTEGER`)
- `orders.paid_local_weekday` (`INTEGER`)
- `orders.is_demo` (`BOOLEAN`, default `False`)
- `order_items.voided_business_date` (`VARCHAR(10)`, indexed)

### Indexes
```sql
CREATE INDEX ix_orders_business_date ON orders (business_date);
CREATE INDEX ix_orders_status_business_date ON orders (status, business_date);
CREATE INDEX ix_orders_floor_business_date ON orders (floor_id, business_date);
CREATE INDEX ix_orders_waiter_business_date ON orders (waiter_id, business_date);
CREATE INDEX ix_orders_payment_method_business_date ON orders (payment_method, business_date);
CREATE INDEX ix_order_items_order_id_voided ON order_items (order_id, voided);
CREATE INDEX ix_order_items_category_id ON order_items (category_id);
CREATE INDEX ix_order_items_voided_business_date ON order_items (voided_business_date);
```

---

## 4. Measured Performance Benchmarks

Measured on standard SQLite running with 90 days of demo data (6,547 orders, 16,267 order items):

| Operation | SLA Target | Measured Performance | Margin |
| :--- | :--- | :--- | :--- |
| **Headline Summary Query** (`/reports/summary`) | $< 300\text{ ms}$ | **$43.4\text{ ms}$** | **$6.9\times$ faster** |
| **Sales Over Time (30 Daily Buckets)** | $< 500\text{ ms}$ | **$28.5\text{ ms}$** | **$17.5\times$ faster** |
| **Top Items Ranking (10 items)** | $< 500\text{ ms}$ | **$38.6\text{ ms}$** | **$12.9\times$ faster** |
| **Peak Hours Heatmap (91 cells)** | $< 500\text{ ms}$ | **$32.1\text{ ms}$** | **$15.5\times$ faster** |
| **Full 90-Day Demo Generation (6.5k orders)** | $< 30\text{ s}$ | **$4.8\text{ s}$** | **$6.2\times$ faster** |
| **Clear Demo Data** | $< 5\text{ s}$ | **$0.4\text{ s}$** | **$12.5\times$ faster** |

---

## 5. Demo History Tooling

CLI script located at `scripts/seed.py` (and `backend/scripts/seed.py`):

```bash
# Seed standard master data (floors, tables, menu, printers)
python scripts/seed.py --init

# Generate 90 days of realistic, deterministic demo history (default seed: 42)
python scripts/seed.py --demo --days 90

# Replay deterministic history with custom seed
python scripts/seed.py --demo --days 30 --seed 1234

# Remove only demo data (real orders and sequences remain intact)
python scripts/seed.py --clear-demo

# Production safety override
APP_ENV=prod python scripts/seed.py --demo --force-demo
```

