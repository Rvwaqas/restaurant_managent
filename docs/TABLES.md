# Table Grid & Real-Time Sync Architecture

This document describes the data model, synchronization abstraction, and tablet UI states for table management in the restaurant POS.

---

## 1. Table Data Contract (`src/types/index.ts`)

```typescript
export type TableStatus = "free" | "occupied";

export interface Table {
  id: string;               // e.g. "f1-t1"
  floorId: string;          // e.g. "f1" (Floor 1 Halal) or "f2" (Floor 2 Non-Halal)
  number: number;           // Display number (e.g. 1, 2, ..., 10)
  capacity: number;         // Seating capacity (2, 4, 6, 8)
  status: TableStatus;      // "free" | "occupied"
  currentOrderId?: string;  // Reference to open active order
  runningTotal?: number;    // Accumulated bill for occupied table (e.g. 48.50)
  openedAt?: string;        // ISO 8601 timestamp when table was marked occupied
}
```

---

## 2. Sync Abstraction Interface (`src/lib/realtime/tablesSync.ts`)

To decouple components from the underlying transport protocol, tables subscribe through an abstract interface:

```typescript
export type TablesUpdateCallback = (tables: Table[]) => void;
export type SyncErrorCallback = (error: Error) => void;

export interface TablesSyncService {
  subscribe: (
    floorId: string,
    onUpdate: TablesUpdateCallback,
    onError?: SyncErrorCallback
  ) => () => void;
}
```

### Current Implementation: Polling
- **Interval:** Polls `tablesService.listByFloor(floorId)` every 5,000ms.
- **Power & Network Saving:** Pauses polling when the browser tab/app is hidden (`document.visibilityState === "hidden"`).
- **Fast Wakeup:** Immediately triggers a fetch when the tablet becomes visible or when the `online` event fires.
- **Unsubscribe:** Returns a disposal function to clear timers and event listeners upon unmount.

### Future Implementation: WebSockets / Server-Sent Events (FastAPI)
During the backend development phase, `tablesSync` will be replaced with a WebSocket connection (`ws://<server-ip>:8000/api/tables/sync?floorId=...`).
Because UI components interact exclusively with `useTablesSync(floorId)` and `useTablesStore()`, zero component rewrites are needed.

---

## 3. Zustand Store Architecture (`src/store/tablesStore.ts`)

The store maintains table states indexed by `floorId`:
- `items: Record<string, Table[]>`: Table lists keyed by floorId.
- `status: "idle" | "loading" | "refreshing" | "error"`: Distinguishes between initial loading skeletons and silent background polling.
- `lastUpdatedAt: Record<string, string | null>`: Tracks the last sync timestamp per floor.
- `changedTableIds: string[]`: Array of table IDs that changed occupancy status in the latest poll. Triggers a 1.5-second highlight pulse animation so waiters notice changes made on other tablets.
- `counts(floorId)`: Granular selector computing `{ total, free, occupied }` without triggering re-renders across unaffected floors.

---

## 4. UI Grid & Tablet Constraints

- **Ergonomics:** Large table tiles ($\ge 140\times 130\text{px}$), min 48px touch targets, active press scale (`active:scale-[0.98]`), and haptic feedback (`navigator.vibrate(10)`).
- **Colors:** Strictly reserved:
  - Green (`#16A34A` / soft `#DCFCE7`) for Free / Available.
  - Red (`#DC2626` / soft `#FEE2E2`) for Occupied.
- **Elapsed Time:** Occupied tables display live elapsed times (e.g. "25m", "1h 14m") updated every minute via a client-side ticker without unnecessary network traffic.
- **Offline Resilience:** If 2 consecutive polling attempts fail or WiFi drops, the grid continues displaying cached tables with an amber warning banner: "Showing last saved data, reconnecting to WiFi...".

