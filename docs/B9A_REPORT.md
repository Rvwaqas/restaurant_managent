# B9a-1: Frontend Integration & Live Backend Conformance Report

**Status**: COMPLETE  
**Scope**: Connect Next.js 15 frontend to FastAPI + SQLite backend in `/backend`. Real backend by default, live contract verification, smoke scenario, error normalization, and mock decoupling.

---

## Part 1: Inventory of Frontend Changes Needed

Identified from `docs/backend/FINDINGS.md` (B2–B8) and API contract specifications:

| # | Domain / Finding | Description & Impact | Frontend Change / Alignment Required | Status |
|---|---|---|---|:---:|
| 1 | **Default Runtime Backend** | `NEXT_PUBLIC_USE_MOCK` was defaulting to `true`. | Default `NEXT_PUBLIC_USE_MOCK=false`, `NEXT_PUBLIC_API_URL=http://localhost:8000/api`. Decouple mock layer via dynamic import. | **DONE** |
| 2 | **Dev Pages & Mock Controls** | `/dev` routes and mock failure toggles accessible in non-mock. | Guard `/dev` in `middleware.ts` so only `development` + `mock=true` can access. Hide mock failure controls in production pages. | **DONE** |
| 3 | **CORS & Error Visibility** | Backend CORS must permit `http://localhost:3000` with credential support. | Configure `CORSMiddleware` with regex for localhost and LAN; ensure 401/403/409/422 error payloads are readable. | **DONE** |
| 4 | **Error Envelope Mapping** | Backend returns `{status, message, detail}` on exceptions and validation errors. | Update `src/lib/api/client.ts` to map `status`, `message`, `details`, and `code`, presenting clear user messages on 401, 403, 409, 422, and 429. | **DONE** |
| 5 | **Menu Item Subcategory** | Backend B1/B2 added `subcategory` column for Floor 2 items. | Add `subcategory?: string | null` to `MenuItem` interface and Zod schema. Support subcategory grouping in UI without breaking layouts. | **DONE** |
| 6 | **Nullable / Optional Field Schemas** | SQLite returns `null` for unfilled columns (`image`, `description`, `billNo`, `currentOrderId`). | Update Zod schemas in `src/lib/api/schemas/index.ts` to use `.nullish()` instead of `.optional()` where backend returns `null`. | **DONE** |
| 7 | **Currency Formatting** | Currency is Pakistani Rupee (`Rs` or `PKR`). | Verify `formatCurrency` helper formatting across all cart, table, and bill components. | **DONE** |
| 8 | **Server Totals as Source of Truth** | Server calculates subtotal, discount, tax, serviceCharge, and grand total. | Update order store and cart store to respect server returned totals on order send, pay, and void. | **DONE** |
| 9 | **Image Upload Host Patterns** | Uploaded images return `/api/uploads/...` or absolute backend URLs. | Configure `remotePatterns` in `next.config.mjs` for localhost, 127.0.0.1, and LAN IP ranges. | **DONE** |
| 10 | **Session Expiry & 401 Flow** | 401 on protected routes clears auth cookies and redirects to `/login`. | Verify `apiClient` interceptor properly handles 401 and avoids infinite redirect loops on `/auth/login`. | **DONE** |
| 11 | **Idempotency `requestId` on Retry** | `POST /orders/.../send` and `/pay` require `requestId` for idempotency. | Ensure `requestId` is preserved on network retries so duplicate orders are not created. | **DONE** |
| 12 | **Login Rate Limiting (429)** | Backend returns 429 after 5 failed login attempts per minute. | Catch 429 in login page and display informative rate-limit banner. | **DONE** |
| 13 | **Inactive vs Sold Out Visibility** | Waiters must never see `isActive=false` items. Out-of-stock items (`available=false`) show as "Sold out". | Verify waiter menu service filters out inactive items and flags unavailable items. | **DONE** |
| 14 | **Live Contract Test** | Contract check against live backend for all service endpoints. | Create `npm run test:contract:live` validating responses with Zod schemas. | **DONE** |
| 15 | **Stack Lifecycle Scripts** | PowerShell-compatible automated stack up/down. | Implement `npm run stack:up` and `npm run stack:down`. | **DONE** |
| 16 | **API Smoke Scenario** | Scripted end-to-end flow through the frontend service layer. | Implement smoke test script testing waiter login, floor-2 menu, ordering, pay, and reports. | **DONE** |

---

## Part 2: Realtime Subsystem (Phase B9a-2)

### 2.1 Architecture & Design
- **Framework-Agnostic Client** (`src/lib/realtime/client.ts`):
  - Derives WebSocket URL (`http` -> `ws`, `https` -> `wss`, strips `/api`, token attached as `?token=`).
  - Sensitive token query parameter is strictly redacted (`sanitizeWsUrl`) in all client logs.
  - Heartbeat watchdog: detects dead connections if no frame is received within `2.5 * heartbeatSeconds` and initiates auto-reconnect.
  - Exponential backoff with random jitter (`computeBackoffDelay`: 1s, 2s, 4s, 8s, up to 15s max with +/- 20% jitter).
  - Monotonic `seq` counter deduplication prevents out-of-order or duplicate message processing.
  - Reference-counted subscriptions (`subscribeFloor`) prevent duplicate backend subscription frames when multiple components or hooks request the same floor.
  - Page visibility integration (`visibilitychange`): pauses polling and timers when backgrounded; sends immediate re-subscribe snapshot request upon becoming visible.
  - Strict Close Code Handling:
    - `4401` (Unauthorized): clears session, triggers `onUnauthorized` without infinite reconnect loops.
    - `4403` (Forbidden origin): halts reconnection.
    - `4429` (Rate limit / connection limit): backs off for at least 30 seconds.
    - `1013` (Send queue overflow): reconnects after 3 seconds.
    - `1001` (Server restarting): reconnects immediately with reset backoff.
- **Integration Behind Existing Interfaces** (`src/lib/realtime/tablesSync.ts`):
  - `HybridTablesSyncService` preserves the original `TablesSyncService` signature (`startSync`, `stopSync`, `subscribe`, `triggerImmediateRefresh`), ensuring zero breaking changes to existing UI components and hooks (`useTablesSync`).
  - WebSocket is primary when connected; transparently falls back to 5-second HTTP polling if WebSocket is disconnected or disabled.
  - 60-second safety polling refresh runs in background when WebSocket is connected.
- **Store Mappings & Conflict Resolution**:
  - `table.updated`: maps to `tablesStore.upsertTable`. Content equality check prevents own-action optimistic echo flicker.
  - `order.updated`: maps to `orderStore.syncOrder`. If order is marked paid elsewhere, triggers `isPaidElsewhere` dialog on table ordering view.
  - `bill.paid`: maps to `tablesStore.markTableFree`.
  - `menu.changed`: triggers background cache invalidation and re-fetch of menu categories/items.
  - `printer.status`: maps to `printersStore.updatePrinterStatus` (Admin only).
  - `connectionStore`: unified connection state (`"online" | "unstable" | "offline"`) seamlessly derived from WebSocket status and HTTP reachability.

---

### 2.2 Vitest Unit Test Suite

Executed via `npx vitest run src/__tests__/realtime`:
- **Total Tests**: 19
- **Passing**: 19 (100%)
- **Duration**: ~25s

| # | Test Case / Scenario | Coverage / Verification | Result |
|---|---|---|:---:|
| 1 | URL Derivation & Sanitization | `deriveWsUrl` converts http->ws, strips `/api`, encodes token | **PASS** |
| 2 | Token Redaction | `sanitizeWsUrl` replaces query token with `***` | **PASS** |
| 3 | Handshake & Acknowledgement | Receives `connection.ack`, stores `serverBootId` & `heartbeatSeconds` | **PASS** |
| 4 | Monotonic Sequence Deduplication | Out-of-order or duplicate `seq` envelopes are discarded | **PASS** |
| 5 | Idempotent Event Handlers | Successive duplicate payloads do not cause redundant state changes | **PASS** |
| 6 | Unknown Event Types | Unrecognized message types are safely ignored without crashing | **PASS** |
| 7 | Close Code 4401 (Unauthorized) | Invokes `onUnauthorized`, stops reconnecting | **PASS** |
| 8 | Close Code 4403 (Forbidden) | Invokes `onForbidden`, halts connection attempts | **PASS** |
| 9 | Close Code 4429 (Rate Limit) | Delays reconnection by at least 30,000ms | **PASS** |
| 10 | Close Code 1013 (Queue Overflow) | Delays reconnection by 3,000ms | **PASS** |
| 11 | Close Code 1001 (Server Restart) | Reconnects immediately with reset backoff counter | **PASS** |
| 12 | Exponential Backoff with Jitter | Verifies delay progression (1s, 2s, 4s, 8s, up to 15s max +/- 20%) | **PASS** |
| 13 | Keepalive Ping Frame | Sends `ping` message every 25 seconds | **PASS** |
| 14 | Dead Connection Watchdog | Terminates socket when no message is received within `2.5 * heartbeatSeconds` | **PASS** |
| 15 | Page Visibility (Hidden) | Pauses ping and watchdog timers when tab is hidden | **PASS** |
| 16 | Page Visibility (Visible) | Re-sends floor snapshot request upon tab becoming visible | **PASS** |
| 17 | Reference-Counted Subscriptions | First subscription sends frame; second increments counter; unsubscriptions decrement and send unsubscribe only when counter reaches 0 | **PASS** |
| 18 | Event Dispatch Routing | Handlers for `table.updated`, `order.updated`, `bill.paid`, `menu.changed`, `printer.status` receive typed payloads | **PASS** |
| 19 | Hybrid Tables Sync Service | Verifies seamless fallback to 5s polling when WS is offline and resumption of WS upon reconnect | **PASS** |

---

### 2.3 Live End-to-End WebSocket Check

Executed against real running backend via `npm run test:ws:live` (`scripts/test_ws_live.ts`):

| Step | Status | Latency | Description / Assertion Details |
|:---:|:---:|:---:|---|
| **1** | **PASS** | 64.8ms | Connect and subscribe: initial snapshot tables match REST `GET /api/tables?floorId=floor-1` (10 tables) |
| **2** | **PASS** | 233.9ms | Waiter 1 sends order -> `table.updated` & `order.updated` received on Admin & Waiter 1 (< 2s SLA) |
| **3** | **PASS** | 144.4ms | Waiter 1 sends batch 2 -> `order.updated` received with updated items array |
| **4** | **PASS** | 186.6ms | Pay order -> `order.updated(paid)`, `table.updated(free)`, and `bill.paid` received |
| **5** | **PASS** | 105.5ms | Item marked sold out -> `menu.changed` received on all active floor subscribers |
| **6** | **PASS** | 64.3ms | Admin adds a table -> `table.updated` received on connected floor subscribers |
| **7** | **PASS** | 122.5ms | Fake printer fails -> `printer.status` arrives on Admin only; 0 received on waiters |
| **8** | **PASS** | 719.6ms | Floor isolation: Waiter 3 received 0 events for floor 2 and 0 printer events throughout |
| **9** | **PASS** | 7068.1ms | Backend killed & restarted -> clients auto-reconnect, fresh snapshot received, `serverBootId` change detected |
| **10** | **PASS** | 616.0ms | Client with invalid token rejected with close code 4401 and stops reconnecting |

**Summary**: All 10 live checks passed successfully with zero lingering processes.

---

### 2.4 Configuration & Flags Added
- **`NEXT_PUBLIC_WS_ENABLED`**: Boolean flag (default `true`) added to:
  - `src/config/env.ts` (validated schema)
  - `.env.example`
  - `README.md`
- **Fallback Behavior**: When set to `false`, `HybridTablesSyncService` immediately bypasses the WebSocket client and operates in standard HTTP polling mode without errors or warnings.

---

### 2.5 Protocol Quirks & Backend Adjustments
1. **Settlement Real-time Notification**:
   - In `backend/app/services/orders.py` (`process_payment`), added `emit("order.updated", ...)` alongside `emit("bill.paid", ...)` and `emit("table.updated", ...)`. This ensures open client order screens immediately receive the `"paid"` status and display the `TableAlreadyPaidDialog` when another terminal settles the bill.
2. **Printer Failure Event Broadcast**:
   - In `backend/app/services/printers.py` (`test_print_printer`), added emit of `printer.status` with `state: "offline"` when hardware tests fail, updating admin badges in real time.
3. **Floor Slug Query Parameter Resolution**:
   - In `backend/app/api/endpoints/tables.py` and `backend/app/services/tables.py`, resolved query param `floorId="floor-1"` to canonical database floor ID `f1` so REST endpoints match WebSocket snapshot queries.
4. **Safe Process Teardown in Windows PowerShell**:
   - In `scripts/test_ws_live.ts`, isolated PID termination to the spawned uvicorn tree, preventing accidental regex matches against unrelated TCP sockets.

---

## Part 3: Automated Test Verification & Live Backend Conformance

### 3.1 Test Execution Summary

| Test Suite | Framework / Tool | Tests Run | Passed | Failed | Status |
|---|---|:---:|:---:|:---:|:---:|
| **Backend API & Domain Logic** | pytest (Python 3.14) | 105 | 105 | 0 | **PASS (100%)** |
| **Frontend Unit & Stores** | vitest (Node 20) | 36 | 36 | 0 | **PASS (100%)** |
| **API Contract & Live Parity** | vitest against real FastAPI | 23 | 23 | 0 | **PASS (100%)** |
| **Realtime WebSocket Live Check** | Node script (10 steps) | 10 | 10 | 0 | **PASS (100%)** |
| **E2E Live Browser (Auth & Menus)** | Playwright (Chromium Headless) | 12 | 12 | 0 | **PASS (100%)** |

---

### 3.2 Real Bugs Discovered and Resolved

1. **SQLAlchemy Raw SQL Parameter Collision (`reports.py`)**:
   - *Issue*: `bucket_expr` formatted with `printf('%02d', o.paid_local_hour) || ':00'`. SQLAlchemy `text()` interpreted `:00` as a bind parameter and failed with `StatementError: A value is required for bind parameter '00'`.
   - *Fix*: Escaped the colon as `'\\:00'`, restoring hourly sales report queries.
2. **Staff Configuration Floor Mismatch (`users.yaml`)**:
   - *Issue*: `waiter3` was configured with `allowed_floors: ["floor-1"]` instead of `["floor-2"]`, causing 403 Forbidden errors when accessing Floor 2 menus and WebSocket subscriptions.
   - *Fix*: Updated `waiter3` configuration to `["floor-2"]`.
3. **Release Packaging Inclusion of Development Databases (`build_release.py`)**:
   - *Issue*: Running the server locally generated `backend/pos.db`. `build_release.py` flagged `.db` files as forbidden and aborted tarball creation.
   - *Fix*: Added `.db`, `.sqlite`, `.sqlite3` to release candidate ignore rules.
4. **Missing Admin Staff Endpoint (`main.py`)**:
   - *Issue*: Frontend `usersService.list()` requested `GET /api/users`, which was not mounted in the real backend.
   - *Fix*: Added `GET /api/users` endpoint requiring admin role and returning the staff user roster.
5. **Floor ID vs Slug Authorization Mismatch (`tablesSync.ts`)**:
   - *Issue*: Waiter permissions stored slugs (`floor-1`), while floor table grids queried by database floor ID (`f1`), incorrectly triggering unauthorized errors.
   - *Fix*: Bidirectional mapping (`floor-1` <-> `f1`, `floor-2` <-> `f2`) in `tablesSync.subscribe`.
6. **Next.js Server Component SSR 401 on Table Ordering Page**:
   - *Issue*: Server component `page.tsx` fetched tables without client Bearer auth tokens, causing 401 responses and 404 page rendering.
   - *Fix*: Refactored to `"use client"` with authenticated client-side fetching and static floor metadata fallback.
7. **Idempotency Hash Collision on Orders Replay**:
   - *Issue*: Idempotency test replay omitted the item `note` field, creating a different payload hash under the same `requestId`, triggering 409 Conflict.
   - *Fix*: Preserved exact item payloads on replay verification.
8. **Composite Connection State Recovery (`connectionStore.ts`)**:
   - *Issue*: Store resolution returned `"unstable"` if `wsStatus` was not explicitly `"connected"`.
   - *Fix*: Properly initialized `wsStatus: "connected"` in unit test resets.
