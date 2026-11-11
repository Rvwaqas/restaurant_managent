# RESTAURANT POS API CONTRACT & ARCHITECTURAL SPECIFICATION

## 1. Overview & Protocol Conventions

This document defines the complete and authoritative API contract for the **Soufi Restaurant POS** system. It specifies every endpoint, data schema, error response, permission rule, idempotency mechanism, and ESC/POS thermal printing format required for the FastAPI + SQLite backend.

### 1.1 Base URL & Content Negotiation
- **Base URL**: `/api` (e.g. `http://<server-ip>:8000/api`)
- **Transport**: HTTP/1.1 (and WebSocket at `/ws`)
- **Payload Format**: `application/json` (UTF-8) for all requests and responses, except image uploads which accept `multipart/form-data`.
- **API Versioning**: Unversioned for local LAN deployment; endpoints are rooted under `/api`.

### 1.2 Authentication & Authorization Headers
- Authentication uses HTTP Bearer tokens:
  ```http
  Authorization: Bearer <jwt-token>
  ```
- **Token Validity**: 12 hours (covers standard continuous restaurant shifts).
- **Hardcoded Staff Model**: Staff users are provisioned and assigned by management (no public signup, no password reset). Waiters possess role `'waiter'` and optional `allowedFloors` restrictions (`['floor-1']`, `['floor-2']`, or both). Admins possess role `'admin'` with unrestricted access to all floors, hardware management, void authorizations, and financial reports.

### 1.3 Standard Error Format
All non-2xx responses adhere to the standard `ApiError` structure:
```json
{
  "message": "Human-readable error description",
  "detail": "Optional internal detail or trace",
  "errors": {
    "fieldName": ["Field validation failure details"]
  }
}
```

Standard HTTP status codes:
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Malformed JSON or invalid parameter format.
- `401 Unauthorized`: Missing, expired, or invalid bearer token.
- `403 Forbidden`: Insufficient role (e.g., waiter attempting an admin void) or unauthorized floor access.
- `404 Not Found`: Target resource (table, order, category, item) does not exist.
- `409 Conflict`: Business state conflict (e.g. table number collision on same floor, deleting an occupied table, deleting a category containing active items).
- `422 Unprocessable Entity`: Validation failure on business logic (e.g., cash received is less than bill total, attempting to checkout an order with no active items).
- `500 Internal Server Error`: Unhandled server exception.

### 1.4 Global Conventions & Identifiers
- **IDs**: String identifiers. Primary keys in mock use slugs or prefixed IDs (e.g., `f1`, `f1-t1`, `cat-1`, `mi1`, `prn-kitchen-1`, `mock-ord-f1-t3`). The production backend may use UUIDv4 strings or integer-to-string mappings.
- **Timestamps**: ISO 8601 strings with timezone offset (e.g. `2026-11-05T14:30:00+05:00`).
- **Currency**: Decimal/float numbers representing exact values (e.g. `250.00`). All computations round to 2 decimal places.

---

## 2. Complete Endpoint Inventory

### 2.1 Auth Service (`/auth`)

#### `POST /auth/login`
- **Roles**: Public
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "password123"
  }
  ```
- **Success (200)**:
  ```json
  {
    "token": "pos_jwt_token_string",
    "user": {
      "id": "u1",
      "username": "admin",
      "name": "System Administrator",
      "role": "admin",
      "allowedFloors": ["floor-1", "floor-2"]
    },
    "expiresAt": "2026-11-06T02:30:00Z"
  }
  ```
- **Errors**: `401 Unauthorized` for invalid username or password.

#### `GET /auth/me`
- **Roles**: Authenticated (`admin`, `waiter`)
- **Headers**: `Authorization: Bearer <token>`
- **Success (200)**: Returns current `User` profile.
- **Errors**: `401 Unauthorized` if token missing or invalid.

#### `POST /auth/logout`
- **Roles**: Authenticated
- **Success (200)**:
  ```json
  { "success": true }
  ```

---

### 2.2 Floors Service (`/floors`)

#### `GET /floors`
- **Roles**: Authenticated
- **Success (200)**: Array of `Floor`:
  ```json
  [
    {
      "id": "f1",
      "slug": "floor-1",
      "name": "Ground Floor",
      "menuType": "halal"
    },
    {
      "id": "f2",
      "slug": "floor-2",
      "name": "First Floor",
      "menuType": "non-halal"
    }
  ]
  ```

#### `GET /floors/{slug}`
- **Roles**: Authenticated
- **Path Params**: `slug` (`floor-1` | `floor-2`)
- **Success (200)**: Returns single `Floor`.
- **Errors**: `404 Not Found` if floor slug does not exist.

---

### 2.3 Tables Service (`/tables`)

#### `GET /tables`
- **Roles**: Authenticated
- **Query Params**:
  - `floorId` (string, optional): Filter by floor.
  - `includeInactive` (boolean, optional, default false): Include deactivated tables.
- **Success (200)**: Array of `Table`:
  ```json
  [
    {
      "id": "f1-t1",
      "floorId": "f1",
      "number": 1,
      "capacity": 4,
      "status": "free",
      "isActive": true
    }
  ]
  ```

#### `GET /tables/{id}`
- **Roles**: Authenticated
- **Success (200)**: Returns single `Table`.
- **Errors**: `404 Not Found`.

#### `POST /tables`
- **Roles**: Admin only
- **Request Body**:
  ```json
  {
    "floorId": "f1",
    "number": 15,
    "capacity": 6,
    "isActive": true
  }
  ```
- **Success (201/200)**: Created `Table`.
- **Errors**: `409 Conflict` if table number already exists on this floor.

#### `POST /tables/bulk`
- **Roles**: Admin only
- **Request Body**:
  ```json
  {
    "floorId": "f1",
    "fromNumber": 1,
    "toNumber": 10,
    "capacity": 4,
    "isActive": true
  }
  ```
- **Success (200)**:
  ```json
  {
    "created": 8,
    "skipped": [1, 2],
    "tables": [ ... ]
  }
  ```

#### `PUT /tables/{id}`
- **Roles**: Admin only
- **Request Body**: Partial table update (`number`, `capacity`, `isActive`).
- **Success (200)**: Updated `Table`.
- **Errors**: `409 Conflict` if renamed number collides with an existing table on the same floor.

#### `DELETE /tables/{id}`
- **Roles**: Admin only
- **Success (200)**:
  ```json
  {
    "success": true,
    "id": "f1-t1",
    "softDeleted": false
  }
  ```
- **Errors**:
  - `409 Conflict`: Cannot delete a table while `status == 'occupied'`.
  - Note: If table has historical order records, backend must soft-delete (`isActive = false, softDeleted = true`).

---

### 2.4 Categories Service (`/categories`)

#### `GET /categories`
- **Roles**: Authenticated
- **Query Params**: `floorId` (string, optional), `includeInactive` (boolean, optional).
- **Success (200)**: Array of `Category`:
  ```json
  [
    {
      "id": "c1",
      "floorId": "f1",
      "name": "Appetizers",
      "printerId": "prn-kitchen-1",
      "sortOrder": 1,
      "isActive": true
    }
  ]
  ```

#### `POST /categories`
- **Roles**: Admin only
- **Request Body**: `{ floorId, name, printerId, sortOrder, isActive? }`
- **Success (201/200)**: Created `Category`.

#### `PUT /categories/{id}`
- **Roles**: Admin only
- **Request Body**: Partial category update.
- **Success (200)**: Updated `Category`.

#### `POST /categories/reorder`
- **Roles**: Admin only
- **Request Body**:
  ```json
  {
    "floorId": "f1",
    "orderedIds": ["c2", "c1", "c3"]
  }
  ```
- **Success (200)**: Array of reordered `Category`.

#### `DELETE /categories/{id}`
- **Roles**: Admin only
- **Errors**: `409 Conflict` if category currently contains active menu items.

---

### 2.5 Menu Items Service (`/menu-items` & `/menu`)

#### `GET /menu?floorId={floorId}`
- **Roles**: Authenticated
- **Success (200)**:
  ```json
  {
    "categories": [ ... ],
    "items": [ ... ]
  }
  ```

#### `GET /menu-items`
- **Roles**: Authenticated
- **Query Params**: `floorId`, `categoryId`, `includeInactive`.
- **Success (200)**: Array of `MenuItem`.

#### `POST /menu-items`
- **Roles**: Admin only
- **Request Body**: `{ floorId, categoryId, name, price, image?, description?, available, isActive, sortOrder }`
- **Success (201/200)**: Created `MenuItem`.

#### `PATCH /menu-items/{id}/availability`
- **Roles**: Authenticated (Waiters & Admins can 86 items)
- **Request Body**: `{ available: boolean }`
- **Success (200)**: Updated `MenuItem`.

#### `POST /menu-items/{id}/duplicate`
- **Roles**: Admin only
- **Request Body**: `{ targetFloorId: string, targetCategoryId: string }`
- **Success (200)**: New cloned `MenuItem` created on target floor.

#### `POST /menu-items/reorder`
- **Roles**: Admin only
- **Request Body**: `{ categoryId: string, orderedIds: string[] }`
- **Success (200)**: Updated `MenuItem[]`.

---

### 2.6 Printers Service (`/printers`)

#### `GET /printers`
- **Roles**: Authenticated
- **Success (200)**: Array of `Printer`:
  ```json
  [
    {
      "id": "prn-kitchen-1",
      "name": "Kitchen Grill Printer",
      "ip": "192.168.1.101",
      "port": 9100,
      "isActive": true,
      "role": "kitchen"
    },
    {
      "id": "prn-cashier",
      "name": "Cashier Thermal Printer",
      "ip": "192.168.1.103",
      "port": 9100,
      "isActive": true,
      "role": "cashier"
    }
  ]
  ```

#### `POST /printers/{id}/test`
- **Roles**: Admin only
- **Success (200)**:
  ```json
  {
    "status": "ok",
    "message": "Test print slip successfully sent to Cashier Thermal Printer (192.168.1.103:9100)."
  }
  ```
- **Printer Failure (200 with status: failed)**:
  ```json
  {
    "status": "failed",
    "message": "Network timeout: could not reach printer at 192.168.1.103:9100."
  }
  ```

#### `DELETE /printers/{id}`
- **Roles**: Admin only
- **Errors**: `409 Conflict` if printer is assigned to any active category or is the active cashier printer.

---

### 2.7 Orders Service (`/orders`)

#### `POST /orders/send`
- **Roles**: Authenticated (`waiter`, `admin`)
- **Idempotency**: Checked via `requestId` field. Replaying the same `requestId` returns the previous `SendResult` without creating duplicate items.
- **Request Body**:
  ```json
  {
    "tableId": "f1-t1",
    "requestId": "uuid-v4-client-generated",
    "items": [
      { "menuItemId": "mi1", "qty": 2, "note": "Extra hot" },
      { "menuItemId": "mi4", "qty": 1 }
    ]
  }
  ```
- **Success (200)**:
  ```json
  {
    "order": {
      "id": "ord_101",
      "tableId": "f1-t1",
      "floorId": "f1",
      "waiterId": "u2",
      "status": "open",
      "items": [
        {
          "id": "oi_1",
          "menuItemId": "mi1",
          "name": "Biryani",
          "price": 450,
          "qty": 2,
          "note": "Extra hot",
          "batchNo": 1,
          "sentAt": "2026-11-05T14:30:00Z",
          "categoryId": "c1"
        }
      ],
      "subtotal": 900,
      "tax": 45,
      "discount": 0,
      "total": 945,
      "createdAt": "2026-11-05T14:30:00Z"
    },
    "batchNo": 1,
    "printJobs": [
      {
        "categoryId": "c1",
        "categoryName": "Main Kitchen",
        "printerId": "prn-kitchen-1",
        "printerName": "Kitchen Printer",
        "status": "printed"
      }
    ]
  }
  ```
- **Side Effects**: Table status immediately transitions to `'occupied'` and `table.currentOrderId` is set to `order.id`.

#### `GET /orders/open?tableId={tableId}`
- **Roles**: Authenticated
- **Success (200)**: Returns open `Order` or `null` if table is free.

#### `POST /orders/reprint`
- **Roles**: Authenticated
- **Request Body**: `{ orderId: string, batchNo: number, categoryId: string }`
- **Success (200)**: Returns `PrintJob`.

#### `POST /orders/{id}/void-item`
- **Roles**: **Admin Only** (Guarded; returns `403 Forbidden` if called by a waiter)
- **Request Body**:
  ```json
  {
    "orderId": "ord_101",
    "orderItemId": "oi_1",
    "reason": "Customer changed mind",
    "requestId": "uuid-void-01"
  }
  ```
- **Success (200)**:
  ```json
  {
    "order": { ... },
    "printJob": {
      "categoryId": "c1",
      "printerId": "prn-kitchen-1",
      "status": "printed"
    }
  }
  ```
- **Side Effects**: Marks item as `voided: true`, `voidReason: "..."`, `voidedAt`, `voidedBy`. Recalculates order `subtotal`, `tax`, `total`. Dispatches cancellation slip to the category's kitchen printer.

#### `POST /orders/{id}/pay`
- **Roles**: Authenticated (`waiter`, `admin`)
- **Idempotency**: Checked via `requestId`.
- **Request Body**:
  ```json
  {
    "orderId": "ord_101",
    "requestId": "uuid-pay-01",
    "method": "cash",
    "discountType": "percent",
    "discountValue": 10,
    "amountReceived": 1000
  }
  ```
- **Success (200)**:
  ```json
  {
    "order": {
      "id": "ord_101",
      "status": "paid",
      "billNo": "B-0001",
      "paymentMethod": "cash",
      "subtotal": 900,
      "discount": 90,
      "tax": 40.5,
      "total": 850.5,
      "amountReceived": 1000,
      "changeDue": 149.5,
      "paidAt": "2026-11-05T14:45:00Z"
    },
    "billPrintJob": {
      "categoryId": "cashier",
      "categoryName": "Cashier",
      "printerId": "prn-cashier",
      "printerName": "Cashier Thermal Printer",
      "status": "printed"
    },
    "table": {
      "id": "f1-t1",
      "status": "free",
      "runningTotal": 0
    }
  }
  ```
- **Validation Rules**:
  - `409 Conflict`: Order is already paid.
  - `422 Unprocessable Entity`: Cannot pay an order with no active (non-voided) items.
  - `422 Unprocessable Entity`: For cash payments, `amountReceived` must be >= `total`.
- **Side Effects**:
  - Assigns monotonic daily bill sequence `billNo` (`B-0001`, `B-0002`...).
  - Sets table status back to `'free'`, clears `currentOrderId` and `runningTotal`.
  - Dispatches customer bill print job to the cashier thermal printer.

#### `POST /orders/{id}/reprint-bill`
- **Roles**: Authenticated
- **Errors**: `400 Bad Request` if order is not yet paid.
- **Success (200)**: Returns `PrintJob` for the duplicate customer receipt.

#### `GET /orders/paid`
- **Roles**: Authenticated
- **Query Params**: `page`, `limit`, `date` (`YYYY-MM-DD`), `floorId`, `paymentMethod`, `search`.
- **Success (200)**:
  ```json
  {
    "orders": [ ... ],
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
  ```

---

### 2.8 Reports & Analytics (`/reports`)

All reports require `admin` role and strictly compute metrics from **paid** orders. Open orders and voided items are excluded from sales revenue.

1. `GET /reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`: Returns aggregate net sales, gross sales, taxes, discounts, order counts, and comparison with previous period.
2. `GET /reports/sales-over-time?from=...&to=...&interval=hour|day`: Trend buckets.
3. `GET /reports/by-category`: Revenue and volume share grouped by menu category.
4. `GET /reports/by-floor`: Halal (Floor 1) vs Non-halal (Floor 2) breakdown.
5. `GET /reports/by-waiter`: Sales totals and order counts grouped by staff member.
6. `GET /reports/top-items`: Top selling dishes by quantity and revenue.
7. `GET /reports/by-payment-method`: Cash, Card, and Online mix with percentage share.
8. `GET /reports/peak-hours`: 24-hour distribution matrix.
9. `GET /reports/discounts`: Total discounts granted and breakdown by discount type.
10. `GET /reports/voided-items`: Audit log of cancelled items with reasons and authorizing manager.
11. `GET /reports/daily-closing?date=YYYY-MM-DD`: Full end-of-day financial report (Z-Report data).

---

## 3. ESC/POS Thermal Printing Specification

Thermal printers connect via RAW TCP sockets on port `9100`. Standard paper width is **80mm** (42 or 48 monospace characters per line).

### 3.1 Kitchen Slip Format (Per Category)
```
==========================================
              KITCHEN SLIP               
==========================================
Floor: Ground Floor (Halal)
Table: 5                    Batch: #2
Waiter: Ali                 Time: 14:32:10
Date: 2026-11-05
------------------------------------------
QTY   ITEM                          NOTE
------------------------------------------
 2    Chicken Biryani               Extra hot
 1    Mutton Karahi (Full)          Less oil
------------------------------------------
Total Items: 3
==========================================
```

### 3.2 Kitchen Cancel Slip (Void Notice)
```
==========================================
        *** CANCEL / VOID ITEM ***       
==========================================
Floor: Ground Floor (Halal)
Table: 5
Authorized By: Admin (Manager)
Time: 14:35:00
------------------------------------------
QTY   ITEM
------------------------------------------
 1    Mutton Karahi (Full)
------------------------------------------
Reason: Customer changed mind / wrong order
==========================================
```

### 3.3 Customer Bill Slip (Cashier)
```
==========================================
             SOUFI RESTAURANT             
        Main Boulevard, Gulberg, LHR      
             Tel: 042-35710000            
==========================================
Bill No: B-0042            Date: 2026-11-05
Table: 5 (Ground Floor)    Time: 15:10:22
Cashier: Waqas             Waiter: Ali
------------------------------------------
QTY  DESCRIPTION          PRICE    AMOUNT
------------------------------------------
 2   Chicken Biryani      450.00   900.00
 2   Gulab Jamun          250.00   500.00
------------------------------------------
Subtotal:                       1,400.00
Tax (5%):                          70.00
Service Charge:                     0.00
Discount (10%):                  -140.00
------------------------------------------
TOTAL PAYABLE:                  1,330.00
------------------------------------------
Payment Method: CASH
Cash Received:                  2,000.00
Change Due:                       670.00
==========================================
      THANK YOU FOR DINING WITH US!       
        Software by Antigravity POS       
==========================================
```

---

## 4. WebSocket Real-Time Gateway (`/ws`)

To eliminate aggressive client polling across handheld waiter tablets and the cashier terminal, the backend exposes a WebSocket gateway:

- **URL**: `ws://<backend-host>:8000/ws?token=<jwt-token>`
- **Ping/Pong Heartbeat**: Client sends `{ "type": "ping" }` every 30s; server replies `{ "type": "pong" }`.

### Event Broadcasts:
1. `table.updated`: Emitted when table status, running total, or active order changes.
   ```json
   {
     "event": "table.updated",
     "payload": {
       "tableId": "f1-t1",
       "status": "occupied",
       "runningTotal": 945.0,
       "currentOrderId": "ord_101"
     }
   }
   ```
2. `order.updated`: Emitted when items are sent, voided, or modified.
3. `bill.paid`: Emitted when payment completes and table is released.
4. `menu.changed`: Emitted when an item's 86 availability or price is modified.
5. `printer.status`: Emitted when a printer goes offline or fails a print job.

---

## 5. Frontend-to-Endpoint Mapping Matrix

| Frontend UI Screen | User Interaction | Backend API Endpoint | WebSocket Event Synced |
| :--- | :--- | :--- | :--- |
| `/login` | Staff enters username & password | `POST /api/auth/login` | — |
| `/[floor]` (Table Grid) | Waiter views real-time floor tables | `GET /api/tables?floorId=` | `table.updated`, `bill.paid` |
| `/[floor]/table/[id]` | Waiter browses dishes & cart | `GET /api/menu?floorId=` | `menu.changed` |
| `/[floor]/table/[id]` | Waiter taps "Send to Kitchen" | `POST /api/orders/send` | `order.updated`, `table.updated` |
| `/[floor]/table/[id]` | Waiter taps "Reprint Slip" | `POST /api/orders/reprint` | — |
| `/[floor]/table/[id]` | Admin voids dish with PIN | `POST /api/orders/{id}/void-item` | `order.updated` |
| `/[floor]/table/[id]` | Cashier taps "Pay & Print Bill" | `POST /api/orders/{id}/pay` | `bill.paid`, `table.updated` |
| `/admin/bills` | Manager lists & reprints past bills | `GET /api/orders/paid`, `POST .../reprint-bill` | — |
| `/admin/menu` | Manager adds/edits food items | `GET / POST / PUT / DELETE /api/menu-items` | `menu.changed` |
| `/admin/tables` | Manager creates/edits tables | `GET / POST / PUT / DELETE /api/tables` | `table.updated` |
| `/admin/printers` | Manager tests thermal printers | `GET / POST /api/printers/{id}/test` | `printer.status` |
| `/admin/reports` | Owner views sales & closing reports| `GET /api/reports/*` | — |

---

## 6. Findings & Discrepancies (Code vs Initial Specs)

1. **`PrintJob.status` Enum**:
   - *Documented spec*: Mentioned `'ok' | 'failed'`.
   - *Actual Mock & Types*: Uses `'printed' | 'failed'`. 
   - *Resolution*: Code is source of truth. Both `'printed'` and `'ok'` are accommodated in schemas; backend should standardize on `'printed' | 'failed'`.
2. **`ordersService.voidItem` Signature**:
   - *Types contract*: Takes payload object `{ orderId, orderItemId, reason, requestId }` and calls `POST /orders/${orderId}/void-item`.
   - *Resolution*: Endpoint uses the order ID in the URL and passes item ID + reason in the body.
3. **Table Soft-Delete**:
   - Tables with order history must not be deleted via SQL `DELETE` to preserve foreign key constraints for historical sales reporting. Deleting sets `isActive = false`.

---

## 7. Open Questions & Recommended Defaults

1. **Tax Rate Configuration**:
   - *Current Code*: 5% (0.05) hardcoded in mock.
   - *Recommendation*: Backend should store tax rate in a settings table or environment variable (`POS_TAX_RATE=0.05`), defaulting to 5%.
2. **Offline Printer Queuing**:
   - *Question*: If a kitchen printer runs out of paper during a busy shift, should the HTTP order request fail?
   - *Recommendation*: **Never fail the order request.** The order must be saved to the database, the HTTP response returns `200` with `printJobs[0].status = 'failed'`, and the backend queues the slip for immediate retry when the printer comes back online.

