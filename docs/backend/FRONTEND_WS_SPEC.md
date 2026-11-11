# Frontend WebSocket Integration Specification (Phase B9 Reference)

This document specifies the exact contract, state machine, and resilience patterns for replacing the frontend polling mechanism (`src/lib/realtime/tablesSync.ts`) with the Phase B6 WebSocket gateway in future Phase B9.

> **Status Note**: In Phase B6, frontend code is untouched and remains on HTTP polling (`NEXT_PUBLIC_USE_MOCK=false`). This document specifies the precise roadmap for Phase B9.

---

## 1. Connection Architecture

### 1.1 Endpoint Discovery & Connection
- **URL Scheme**:
  - `const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';`
  - `const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${jwtToken}`;`
- **Authentication**:
  - Retrieve the current staff JWT bearer token from `useAuthStore.getState().user?.token`.
  - Pass the token in the query string `?token=<jwt>`.

### 1.2 Initial Handshake
1. Open WebSocket connection.
2. Await `connection.ack` server frame:
   ```json
   {
     "type": "connection.ack",
     "payload": {
       "userId": "u1",
       "role": "waiter",
       "allowedFloors": ["floor-1"],
       "serverBootId": "...",
       "heartbeatSeconds": 20
     }
   }
   ```
3. Check `serverBootId`:
   - If `serverBootId` has changed from the previous connection, the backend server was restarted. Discard any local cached optimism and request a fresh snapshot.

---

## 2. Floor Subscription & State Management

### 2.1 Floor Subscription
Upon receiving `connection.ack`, or whenever the user switches active floors in the UI:
1. Send subscription message:
   ```json
   { "type": "subscribe", "floorId": currentFloorId }
   ```
2. On receipt of `subscribed`:
   ```json
   {
     "type": "subscribed",
     "payload": {
       "floorId": "f1",
       "tables": [ ... ]
     }
   }
   ```
3. Update `useTablesStore.getState().setTables(payload.tables)`.
4. Transition connection status to `"connected"` and stop the 5s polling timer.

### 2.2 Unsubscribing
When changing floors:
```json
{ "type": "unsubscribe", "floorId": oldFloorId }
```

---

## 3. Real-Time Event Dispatch Handlers

| Message Type | Target Store / Action | Description |
|---|---|---|
| `table.updated` | `tablesStore.updateTable(payload.table)` | Updates the single table card on the floor grid without full re-render. If `table` is `null`, table was deactivated/deleted. |
| `order.updated` | `orderStore.syncOrder(payload.order)` | If the currently viewed order matches `payload.orderId`, update active order state, batch numbers, and running total. |
| `bill.paid` | `tablesStore.markTableFree(payload.tableId)` | Clears the table status on the grid; removes occupied badge; updates paid bill history. |
| `menu.changed` | `menuStore.fetchMenu(payload.floorId)` | Triggers a background refresh of the floor's categories and items. |
| `printer.status` | `adminPrintersStore.updateStatus(payload)` | (Admin only) Updates hardware indicator badges in the header or admin printer panel. |
| `heartbeat` | Connection watchdog | Resets connection watchdog timer. Send `{"type": "ping", "clientTs": Date.now()}` periodically if desired. |

---

## 4. Resilience & Fallback Strategy

### 4.1 Reconnection with Exponential Backoff and Jitter
When the socket closes or encounters an error:
```typescript
let reconnectAttempts = 0;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

function scheduleReconnect() {
  const expDelay = Math.min(BASE_DELAY_MS * Math.pow(1.5, reconnectAttempts), MAX_DELAY_MS);
  // Add random jitter of +/- 20%
  const jitter = expDelay * (0.8 + Math.random() * 0.4);
  reconnectAttempts++;
  setTimeout(connectWebSocket, jitter);
}
```

### 4.2 Graceful Fallback to Polling
- If the WebSocket fails to connect after 3 consecutive attempts, or if WebSocket support is disabled by configuration (`NEXT_PUBLIC_ENABLE_WS=false`), automatically fallback to the existing 5-second HTTP polling mechanism (`fetchTables()`).
- In the background, continue attempting to reconnect the WebSocket every 30 seconds. When the WebSocket successfully re-establishes, resume real-time mode and suspend HTTP polling.

### 4.3 Page Lifecycle & Background Tab Handling (`visibilitychange`)
On mobile devices and POS tablets, browsers throttle timers and WebSocket background traffic:
```typescript
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    // If socket is closed or stale, reconnect immediately
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    } else {
      // Re-request table snapshot to heal any events missed while tab was hidden
      ws.send(JSON.stringify({ type: "subscribe", floorId: currentFloorId }));
    }
  }
});
```

### 4.4 Close Code Handling
- `1001` (Server restarting): Immediately schedule reconnect with backoff; server was restarted.
- `4401` (Unauthorized): Session expired. Redirect user to `/login` with prompt.
- `4403` (Forbidden Origin): Configuration error. Fallback to polling.
- `4429` (Rate limit or connection limit): Back off for at least 15 seconds before attempting reconnection.

