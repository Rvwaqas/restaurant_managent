# Admin Management Documentation (Task F7)

## Overview

The Admin Management suite provides restaurant administrators with complete operational control over menus, floor layouts, and network hardware. Built specifically for tablet ergonomics with high-density scanning, minimum 48px touch targets, and instant feedback.

---

## 1. Role Guards & Route Protection

All admin pages reside under `src/app/(admin)/admin/` and are protected on both the Edge (Next.js middleware) and client layers:
- **Middleware (`src/middleware.ts`)**: Checks `role === "admin"`. Non-admin sessions are redirected to `/403`.
- **Component Layer (`<RoleGuard roles={["admin"]}>`)**: Wraps page trees to prevent unauthorized rendering during client-side transitions.
- **Allowed Users**: Default admin user (`admin` / `admin123`). Waiters attempting to access `/admin/*` receive 403 Forbidden.

---

## 2. Floor Menu Architecture (`/admin/menu`)

### Multi-Floor Isolation
- **Floor 1 (Halal)**: ID `f1`, slug `/floor-1`.
- **Floor 2 (Non-Halal)**: ID `f2`, slug `/floor-2`.
- Switching floors updates the state immediately and refreshes categories and dishes.

### Food Categories
- **Attributes**: `id`, `floorId`, `name`, `printerId`, `sortOrder`, `isActive`.
- **Reordering**: Drag-and-drop ordering powered by `@dnd-kit/core` and `@dnd-kit/sortable`. The sequence directly controls kitchen slip grouping.
- **Kitchen Printer Assignment**: Every category is bound to a network thermal printer. Orders placed on waiter tablets for this category print directly to the assigned printer.
- **Visibility Toggle**: Toggling `isActive` instantly hides or reveals the category and its dishes on waiter screens.
- **Delete Conflict Prevention**: A category cannot be deleted if active dishes still belong to it (returns HTTP 409). Categories with historical sales are soft-deleted (`isActive = false`).

### Menu Items (Dishes)
- **Attributes**: `id`, `floorId`, `categoryId`, `name`, `price`, `description`, `image`, `available`, `isActive`, `sortOrder`.
- **Image Optimization**: Images captured on tablet cameras or uploaded from disk are resized client-side via HTML5 Canvas to a maximum of 600px on the longest dimension and encoded as WebP format before storage, minimizing tablet memory pressure and Wi-Fi transfer times.
- **Optimistic Stock Availability**: "Available / Sold Out" switch updates instantly with automatic rollback if network failure occurs.
- **Cross-Floor Duplication**: "Duplicate Dish" action allows admins to clone a dish from Floor 1 to Floor 2 (or vice versa), choosing the destination category.
- **Bulk Actions**: Multi-select dishes to mark in stock, sold out, or delete simultaneously.
- **View Toggle**: Switch between responsive Grid Cards and dense Table View.

---

## 3. Table Layout Management (`/admin/tables`)

- **Live Status Monitoring**: Table cards display a live occupancy indicator (emerald for Free, pulsing rose for Occupied) with running order total.
- **10-Second Silent Polling**: Automatically refreshes table statuses in the background to reflect waiter check-ins and payments mid-rush.
- **Inline Capacity Editor**: `+` and `-` steppers on each table card allow rapid seat adjustment without opening dialogs.
- **Single Add / Edit**: Create custom table numbers and capacities with per-floor uniqueness checks.
- **Bulk Range Generator**: Generate numbered sequences (e.g. Tables 1 through 20) in one tap. Existing table numbers within the range are automatically skipped and displayed in a preview summary.
- **Delete Integrity**: Occupied tables cannot be deleted (returns HTTP 409). Tables with past order history are soft-deleted (`isActive = false`) so historical receipts and waiter reports remain intact.

---

## 4. Network Thermal Printers (`/admin/printers`)

- **Direct RAW TCP/IP Socket Printing**: Configured for ESC/POS thermal printers (port 9100 standard).
- **Printer Roles**:
  - `kitchen`: Receives preparation tickets for assigned categories.
  - `cashier`: Receives customer receipt bills when payment is confirmed.
- **Cashier Printer Validation Banner**:
  - Warns if 0 cashier printers are active (payment receipts will fail).
  - Notes if multiple cashier printers are active (primary used by default).
- **Category Usage Safeguard**: Attempting to delete a printer assigned to active categories is blocked (HTTP 409) with a list of dependent categories.
- **Live Test Print**: Sends a synthetic test slip verifying socket reachability.
- **Dev Failure Simulation**: Toggle on any printer to test simulated network timeout handling on waiter and cashier devices.

---

## 5. Overview Dashboard (`/admin`)

- Real-time KPIs: Today's sales, paid bill counts, active occupied tables, and printer health.
- Quick navigation tiles to Menu, Tables, Printers, Paid Bills Audit, and Reports.
- Direct links to launch waiter floor screens on Floor 1 and Floor 2.

