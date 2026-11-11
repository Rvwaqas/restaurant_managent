# Orders & Kitchen Dispatch Architecture (Task F5)

This document details the ordering flow, data contracts, idempotency handling, thermal slip printing, and offline/tablet behavior for the Restaurant POS.

---

## 1. Core Workflow Overview

1. **Table Selection:** Waiter selects a table from the floor grid (`/[floor]/table/[tableId]`).
2. **Floor Isolation:** `/floor-1` provides the Halal catalog; `/floor-2` provides the Non-Halal catalog.
3. **Menu Browsing & Search:**
   - Categories listed horizontally as big-touch chips ("All", "Sweet", "Spicy", etc.).
   - Live dish search by name and description.
   - Sold-out / unavailable dishes visually disabled with "Sold Out" badge.
4. **Item Selection & Customization:**
   - Single tap on a dish card adds +1 directly to the cart draft.
   - Long-press or sliders icon opens the `ItemOptionsDialog`:
     - Servings stepper (1-99).
     - Preset kitchen notes chips (*Less spicy*, *No onion*, *Sauce on side*, etc.).
     - Custom note input.
5. **Cart Review (`CartPanel`):**
   - **Already Sent Section:** Read-only lines grouped by batch (`Batch 1 - 7:42 PM`) with lock icon.
   - **New Items (Draft) Section:** Editable items with `QuantityStepper`. Reducing quantity to 0 removes the item and shows an Undo toast.
   - Financial totals formatted with `formatMoney` using `Rs`.
6. **Send Action:**
   - Tapping "Send to Kitchen" submits the draft items with a client UUID `requestId`.
   - Free table turns **RED / Occupied** with `currentOrderId` and `openedAt`.
   - Occupied table appends a new batch (`batchNo + 1`).
   - `SendResultSheet` opens, showing batch number, order total, and print jobs status per kitchen printer.
   - Waiter can preview thermal KOT slips or retry any failed print job.

---

## 2. API Contract & Endpoints

### 2.1 Fetch Floor Menu
- **Endpoint:** `GET /menu?floorId=:floorId`
- **Response:**
  ```json
  {
    "categories": [
      { "id": "c1", "floorId": "f1", "name": "Sweet", "printerId": "prn-1", "sortOrder": 1 },
      { "id": "c2", "floorId": "f1", "name": "Spicy", "printerId": "prn-2", "sortOrder": 2 }
    ],
    "items": [
      {
        "id": "mi1",
        "floorId": "f1",
        "categoryId": "c1",
        "name": "Gulab Jamun (2 pcs)",
        "price": 250,
        "available": true,
        "image": "https://..."
      }
    ]
  }
  ```
- **Caching:** Cached in Zustand `menuStore` for 5 minutes per floor.

### 2.2 Get Open Table Order
- **Endpoint:** `GET /orders/open?tableId=:tableId`
- **Response:** `Order | null`

### 2.3 Send Draft Items to Kitchen
- **Endpoint:** `POST /orders/send`
- **Request Payload (`SendItemsPayload`):**
  ```json
  {
    "tableId": "f1-t1",
    "requestId": "a54fd372-87ce-48ab-9c17-1ef02a28b081",
    "items": [
      { "menuItemId": "mi1", "qty": 2, "note": "Serve warm" },
      { "menuItemId": "mi4", "qty": 1, "note": "Less spicy" }
    ]
  }
  ```
- **Response (`SendResult`):**
  ```json
  {
    "order": {
      "id": "ord-101",
      "tableId": "f1-t1",
      "floorId": "f1",
      "waiterId": "u2",
      "status": "open",
      "subtotal": 1150,
      "tax": 0,
      "discount": 0,
      "total": 1150,
      "createdAt": "2026-11-04T13:45:00.000Z",
      "items": [
        {
          "id": "item-1",
          "menuItemId": "mi1",
          "name": "Gulab Jamun (2 pcs)",
          "price": 250,
          "qty": 2,
          "note": "Serve warm",
          "batchNo": 1,
          "sentAt": "2026-11-04T13:45:00.000Z",
          "categoryId": "c1"
        }
      ]
    },
    "batchNo": 1,
    "printJobs": [
      {
        "categoryId": "c1",
        "categoryName": "Sweet",
        "printerId": "prn-1",
        "printerName": "Sweet Kitchen Printer (192.168.1.101)",
        "status": "printed"
      },
      {
        "categoryId": "c2",
        "categoryName": "Spicy",
        "printerId": "prn-2",
        "printerName": "Spicy Kitchen Printer (192.168.1.102)",
        "status": "printed"
      }
    ]
  }
  ```

### 2.4 Reprint Batch Kitchen Slip
- **Endpoint:** `POST /orders/:orderId/batches/:batchNo/reprint`
- **Request Payload:** `{ "categoryId": "c2" }`
- **Response:** `PrintJob`

---

## 3. Idempotency Guarantees

In busy restaurant environments with tablet WiFi drops, network timeouts or double-tap taps on "Send" could cause duplicate kitchen slips and phantom order items.

1. **Client UUID:** Each table cart generates a persistent `requestId` when the first item is added (`crypto.randomUUID()`).
2. **Server/Mock Cache:** When `/orders/send` executes, the resulting `SendResult` is cached under `requestId`.
3. **Deduplication:** Subsequent submissions with the exact same `requestId` bypass order creation and slip dispatch, returning the cached `SendResult` immediately.
4. **Draft Regeneration:** When the order is successfully sent and cleared, a new `requestId` is generated for future additions to that table.

---

## 4. Kitchen Printing & KOT Slips

- **Category-Based Routing:** Dishes are automatically routed to the printer assigned to their category (e.g. Sweet station slip goes to `192.168.1.101`, Spicy station slip goes to `192.168.1.102`).
- **Standard 80mm Thermal Layout:**
  - High-contrast monospace font (`font-mono`).
  - Table number prominently displayed.
  - Waiter name, timestamp, and Batch #.
  - Clear quantities (`2x`) and bold kitchen notes (`** NOTE: Less spicy **`).
- **Failure Resilience:**
  - If a printer fails (offline or out of paper), `status` is returned as `"failed"`.
  - Failed jobs are presented with an **amber** warning and a "Retry" button.
  - Waiter can tap "Preview KOT Slip" to print manually via browser printing or view on screen.

---

## 5. Tablet Ergonomics & Exit Guards

- **Draft Persistence:** Unsent items remain in `cartStore` (persisted across refreshes for up to 12 hours).
- **Amber Draft Dot on Floor Grid:** Table tiles display an amber "Draft" dot if unsent items exist.
- **Exit Warning:** Navigating away from a table with unsent items displays an `UnsentItemsDialog`:
  - **Keep Draft & Leave:** Keeps draft intact and returns to table grid.
  - **Discard Draft & Leave:** Wipes draft for this table and returns to table grid.
  - **Stay:** Dismisses the dialog to resume ordering.
- **Silent Refresh:** The open order silently polls the server every 10 seconds without flickering loading states.
