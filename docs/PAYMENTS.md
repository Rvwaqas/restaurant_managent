# Payment, Bill Settlement & Item Void Architecture (Task F6)

This document details the payment settlement workflow, cashier bill slip generation, item cancellation (voids), role-based permissions, idempotency handling, and multi-tablet synchronization for the Restaurant POS.

---

## 1. Core Workflow Overview

1. **Table Status:** An occupied table has an active order with one or more batches of sent items.
2. **Review Bill Summary:**
   - Waiter or Cashier views the order screen.
   - The "Already sent" section features a **"Batches" vs "Summary"** toggle:
     - **Batches view:** Shows chronologically dispatched KOT batches with timestamps.
     - **Summary view:** Consolidates identical items across batches (e.g. 2 Biryani from Batch 1 + 1 Biryani from Batch 2 = 3x Biryani) for convenient reconciliation with the customer.
3. **Pay Button Guard (`canPay`):**
   - The "Pay / Bill" button is enabled **only** when:
     1. An active order exists in `"open"` status.
     2. The order contains at least 1 non-voided item.
     3. There are **no unsent draft items** in the cart.
   - If unsent draft items exist, an inline hint informs staff: *"Send or discard the new items before paying"* with a one-click *"Discard new items"* action.
4. **Payment Sheet Execution (`PaymentSheet`):**
   - Waiter/Cashier taps "Pay / Bill".
   - Sheet displays consolidated active items, subtotal, service charge (`0%`), tax (`0%`), discount, and grand total.
   - **Role Rules:**
     - **Waiters:** Select payment method (Cash, Card, Online).
     - **Admin/Manager:** Also sees the **Manager Discount** section (segmented control for `Rs` amount or `%` percentage) with live recalculation.
   - **Cash Method:**
     - Displays "Amount received" input with quick-amount chips (`Exact`, `500`, `1000`, `2000`, `5000`).
     - Computes live "Change due".
     - "Confirm Payment" button remains disabled until `amountReceived >= total`.
5. **Settlement & Green Table:**
   - On confirmation, `ordersService.pay(payload)` executes with a unique UUID `requestId`.
   - The order status transitions to `"paid"`, assigned a daily bill number (e.g. `B-0007`).
   - The table is freed immediately (`status: "free"`, `currentOrderId: null`, `runningTotal: 0`) and turns **GREEN** across all connected tablets.
   - Cashier network printer outputs the 80mm bill slip.
   - `PaymentResultSheet` presents payment confirmation, change due, printer status, and a button to preview/print the bill receipt.

---

## 2. API Contract & Endpoints

### 2.1 Settle Payment
- **Endpoint:** `POST /orders/:orderId/pay`
- **Request Payload (`PayRequest`):**
  ```json
  {
    "orderId": "mock-ord-f1-t3",
    "requestId": "f89d31bb-5390-482a-9cb8-f02758f192b0",
    "method": "cash",
    "discountType": "amount",
    "discountValue": 100,
    "amountReceived": 2000
  }
  ```
- **Response (`PayResult`):**
  ```json
  {
    "order": {
      "id": "mock-ord-f1-t3",
      "tableId": "f1-t3",
      "floorId": "f1",
      "waiterId": "u2",
      "status": "paid",
      "billNo": "B-0003",
      "paymentMethod": "cash",
      "subtotal": 1800,
      "serviceCharge": 0,
      "tax": 0,
      "discount": 100,
      "discountType": "amount",
      "discountValue": 100,
      "total": 1700,
      "amountReceived": 2000,
      "changeDue": 300,
      "paidAt": "2026-11-04T18:30:00.000Z",
      "paidBy": "u1",
      "items": [...]
    },
    "billPrintJob": {
      "categoryId": "cashier",
      "categoryName": "Cashier",
      "printerId": "prn-cashier",
      "printerName": "Cashier Thermal Printer (192.168.1.103)",
      "status": "printed"
    },
    "table": {
      "id": "f1-t3",
      "floorId": "f1",
      "number": 3,
      "capacity": 4,
      "status": "free"
    }
  }
  ```

### 2.2 Reprint Cashier Bill
- **Endpoint:** `POST /orders/:orderId/reprint-bill`
- **Response (`PrintJob`):**
  ```json
  {
    "categoryId": "cashier",
    "categoryName": "Cashier",
    "printerId": "prn-cashier",
    "printerName": "Cashier Thermal Printer (192.168.1.103)",
    "status": "printed"
  }
  ```

### 2.3 Cancel / Void Sent Item (Admin Only)
- **Endpoint:** `POST /orders/:orderId/void-item`
- **Request Payload (`VoidItemRequest`):**
  ```json
  {
    "orderId": "mock-ord-f1-t3",
    "orderItemId": "oi-102",
    "reason": "Customer changed mind",
    "requestId": "void-9281a-uuid"
  }
  ```
- **Response (`VoidItemResult`):**
  ```json
  {
    "order": {
      "id": "mock-ord-f1-t3",
      "items": [
        {
          "id": "oi-102",
          "name": "Chicken Karahi",
          "price": 850,
          "qty": 1,
          "voided": true,
          "voidReason": "Customer changed mind",
          "voidedAt": "2026-11-04T18:25:00.000Z",
          "voidedBy": "Admin Manager"
        }
      ],
      "subtotal": 950,
      "total": 950
    },
    "printJob": {
      "categoryId": "c2",
      "categoryName": "Spicy",
      "printerId": "p2",
      "printerName": "Spicy Printer (192.168.1.101)",
      "status": "printed"
    }
  }
  ```

### 2.4 List Paid Bills
- **Endpoint:** `GET /orders/paid?date=YYYY-MM-DD&floorId=f1&paymentMethod=cash&search=B-0001&page=1&limit=20`
- **Response (`ListPaidResponse`):**
  ```json
  {
    "items": [...],
    "total": 24,
    "page": 1,
    "limit": 20,
    "totalAmount": 42500
  }
  ```

---

## 3. Error Codes & Edge Cases

| Status Code | Scenario | Response Message | Client Handling |
|:---:|---|---|---|
| `409 Conflict` | Order was already paid on another tablet or terminal | `{"message": "Order already paid"}` | Triggers `TableAlreadyPaidDialog` directing staff back to the floor grid. |
| `422 Unprocessable` | Cash received is less than grand total | `{"message": "Amount received must be at least Rs 1,700.00"}` | Confirm button disabled; inline error banner displayed. |
| `422 Unprocessable` | Order has no active items (all items were voided) | `{"message": "Cannot pay an order with no active items"}` | Pay button disabled. |
| `403 Forbidden` | Non-admin user attempts to void item or apply unauthorized discount | `{"message": "Admin access required to cancel order items"}` | Waiters cannot view discount or cancellation controls. |
| `Network Timeout` | Local WiFi drop while transmitting payment request | Network error | Sheet remains open with identical `requestId`. Retry safe from double-charges. |

---

## 4. Multi-Tablet Free-Table Synchronization

1. **Silent Background Refresh:** While on an order screen, `useOrderStore` polls `GET /orders/open?tableId=...` every 10 seconds.
2. **External Settlement Detection:**
   - If an order was opened and another tablet or the cashier settles it, the next poll returns `status: "paid"` or `null`.
   - The screen triggers a modal: **`TableAlreadyPaidDialog`** ("Table #X Already Paid on another device").
   - Waiter can only tap "Return to Tables Grid", preventing conflicting duplicate charges.

---

## 5. Slips & Thermal Print Layout

- **Bill Slip (`BillSlip`):**
  - Formatted for 80mm thermal paper (`w-full max-w-[320px]`).
  - Monospace font (`font-mono`) with dashed/dotted borders.
  - Consolidates active items across batches and excludes voided items.
  - Displays bill number, table number, waiter name, date/time, totals, cash received & change due.
  - Print isolation via `@media print`.
- **Kitchen Cancellation Ticket (`KitchenCancelSlip`):**
  - High-contrast black header: `*** ITEM CANCELLED ***`.
  - Alerts kitchen station not to prepare the cancelled dish.
  - Includes reason and authorizing manager name.

