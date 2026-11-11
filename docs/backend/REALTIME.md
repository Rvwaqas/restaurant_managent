# Realtime WebSocket Architecture & Protocol Reference (Phase B6)

The Soufi Restaurant POS features an in-process, pure-Python real-time WebSocket subsystem built directly on top of FastAPI and pure-python `websockets`.

WebSocket updates notify clients immediately when table statuses change, orders are placed or modified, bills are settled, menu items change, and printer health shifts. While polling remains the default fallback (`NEXT_PUBLIC_USE_MOCK=false`), this WebSocket gateway allows real-time instant synchronization across floor staff and administrators.

---

## 1. Connection Lifecycle & Endpoints

### 1.1 Endpoint URLs
- `GET /ws?token=<JWT>` (primary)
- `GET /api/ws?token=<JWT>` (alias for reverse proxies with `/api` routing)

### 1.2 Authentication & Handshake
1. **HTTP Upgrade**: The client connects via standard WebSocket upgrade request.
2. **Origin Validation**:
   - The `Origin` header is validated against `WS_ALLOWED_ORIGINS` (default: `http://localhost:3000,http://127.0.0.1:3000`) and a LAN IP regex (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, `localhost`).
   - Missing `Origin` headers are permitted only when `APP_ENV=dev` (e.g. CLI tools, curl).
   - If origin validation fails, the server closes the connection immediately with close code `4403` (`Forbidden origin`).
3. **Capacity Check**:
   - Up to `WS_MAX_CONNECTIONS` (default: 50) simultaneous connections are permitted.
   - If exceeded, the server replies with an error envelope (`TOO_MANY_CONNECTIONS`) and closes with code `4429`.
4. **Token Verification**:
   - The query parameter `token` is verified with HMAC-SHA256 (`SECRET_KEY`).
   - If missing, invalid, or expired, the server replies with an error envelope (`UNAUTHORIZED`) and closes with code `4401`.
5. **Connection Acknowledgment (`connection.ack`)**:
   - Upon successful validation, the server sends a `connection.ack` frame to the client:
   ```json
   {
     "id": "e44d5c92-75d1-4ba2-9218-c518aa667fe1",
     "seq": 1,
     "type": "connection.ack",
     "ts": "2026-11-07T23:30:00.000Z",
     "payload": {
       "userId": "u1",
       "role": "admin",
       "allowedFloors": ["floor-1", "floor-2"],
       "serverTime": "2026-11-07T23:30:00.000Z",
       "serverBootId": "f7ab2c10-8547-4e31-8930-b3fa9900ee12",
       "heartbeatSeconds": 20
     }
   }
   ```

---

## 2. Canonical Server Envelope Format

Every message sent by the server to any client is encapsulated in a canonical envelope:

```json
{
  "id": "<UUID string>",
  "seq": <monotonic integer sequence, increments per server instance>,
  "type": "<message type>",
  "ts": "<ISO 8601 UTC timestamp ending in Z>",
  "payload": { ... }
}
```

---

## 3. Client Action Protocol

Clients issue command frames in JSON format:
```json
{
  "type": "<action>",
  "id": "<optional client request id>",
  ...params
}
```

### 3.1 `subscribe`
Subscribes the client to events for a specific floor.
- **Request**:
  ```json
  { "type": "subscribe", "floorId": "f1" }
  ```
- **Authorization**:
  - Staff users can only subscribe to floors permitted in `users.yaml` (`allowed_floors`).
  - Administrators (`role="admin"`) can subscribe to any floor.
  - If unauthorized, the server replies with an `error` envelope (`code="FORBIDDEN"`), and **the connection remains open**.
- **Response (`subscribed`)**:
  Returns a full table snapshot identical to the HTTP `GET /api/tables?floorId=<id>` response:
  ```json
  {
    "id": "7b0b2e3f-...",
    "seq": 2,
    "type": "subscribed",
    "ts": "2026-11-07T23:30:01.000Z",
    "payload": {
      "floorId": "f1",
      "tables": [
        {
          "id": "f1-t1",
          "floorId": "f1",
          "number": 1,
          "capacity": 4,
          "status": "free",
          "isActive": true,
          "currentOrderId": null,
          "runningTotal": null,
          "openedAt": null
        }
      ]
    }
  }
  ```

### 3.2 `unsubscribe`
Unsubscribes from floor events.
- **Request**:
  ```json
  { "type": "unsubscribe", "floorId": "f1" }
  ```
- **Response (`unsubscribed`)**:
  ```json
  {
    "id": "...",
    "seq": 3,
    "type": "unsubscribed",
    "ts": "...",
    "payload": { "floorId": "f1" }
  }
  ```

### 3.3 `ping`
Client-side keepalive ping.
- **Request**:
  ```json
  { "type": "ping", "clientTs": 1794120000000 }
  ```
- **Response (`pong`)**:
  ```json
  {
    "id": "...",
    "seq": 4,
    "type": "pong",
    "ts": "...",
    "payload": { "clientTs": 1794120000000 }
  }
  ```

---

## 4. Server Broadcast Events

Broadcast topics:
- `"floor:<floorId>"`: Subscribed waiters and admins permitted for this floor.
- `"admin"`: Automatically assigned to all authenticated admin connections.

### 4.1 `table.updated`
Emitted when a table status changes, is assigned an order, or is modified.
- **Payload**:
  ```json
  {
    "floorId": "f1",
    "tableId": "f1-t1",
    "table": {
      "id": "f1-t1",
      "floorId": "f1",
      "number": 1,
      "capacity": 4,
      "status": "occupied",
      "isActive": true,
      "currentOrderId": "ord-abc123",
      "runningTotal": 75.0,
      "openedAt": "2026-11-07T23:25:00.000Z"
    }
  }
  ```
- Note: If table is deactivated or deleted, `table` is `null` for waiters.

### 4.2 `order.updated`
Emitted when an order is created, sent to kitchen, or item status changes.
- **Payload**:
  ```json
  {
    "floorId": "f1",
    "tableId": "f1-t1",
    "orderId": "ord-abc123",
    "order": { ...serialized order schema... }
  }
  ```

### 4.3 `bill.paid`
Emitted when a bill is paid. Broadcast to both `"floor:<floorId>"` and `"admin"`.
- **Payload**:
  ```json
  {
    "floorId": "f1",
    "tableId": "f1-t1",
    "orderId": "ord-abc123",
    "billNo": 1042,
    "total": 85.50,
    "method": "cash"
  }
  ```

### 4.4 `menu.changed`
Emitted when categories or menu items are added, modified, or reordered.
- **Payload**:
  ```json
  {
    "floorId": "f1"
  }
  ```

### 4.5 `printer.status` (Admin Topic Only)
Emitted when printer hardware state or online availability changes.
- **Payload**:
  ```json
  {
    "printerId": "prn-kitchen-f1",
    "state": "ok",
    "message": "Thermal printer ready"
  }
  ```

### 4.6 `heartbeat`
Periodic server ping every `WS_HEARTBEAT_SECONDS` (default: 20s).
- **Payload**: `{}`

---

## 5. Performance, Queues & Error Handling

| Mechanism | Configuration | Description |
|---|---|---|
| **Event Coalescing** | `WS_COALESCE_MS=50` | Rapid bursts of updates to the same entity within 50ms are coalesced into a single broadcast. Delivery latency p95 is ~65ms (< 150ms target). |
| **Send Queue** | `WS_SEND_QUEUE_MAX=100` | Each connection has a bounded `asyncio.Queue` drained by a dedicated writer task. |
| **Slow Consumer Protection** | Close `1013` | If a client blocks and queue fills to 100, the server disconnects the slow consumer with code 1013 (`Send queue overflow`). |
| **Rate Limiter** | 10 msgs/sec | If a client exceeds 10 frames per second, the connection is closed with code `4429`. |
| **Max Frame Size** | `WS_MAX_MESSAGE_BYTES=4096` | Messages exceeding 4096 bytes are closed with code `4429`. |
| **Idle Timeout** | `WS_IDLE_TIMEOUT_SECONDS=60` | Clients sending no frames within 60s are closed with code `4408`. |
| **Token Redaction** | `TokenRedactingFilter` | All access and app logs sanitize `token=<jwt>` to `token=***`. |

---

## 6. WebSocket Close Codes

| Code | Reason | Description |
|---|---|---|
| `1000` | Normal Closure | Clean disconnect. |
| `1001` | Server Restarting | Server lifespan shutdown (`hub.stop()`). Client should reconnect with exponential backoff. |
| `1013` | Send Queue Overflow | Client was too slow to consume messages (`WS_SEND_QUEUE_MAX` breached). |
| `4401` | Unauthorized | Missing, invalid, or expired JWT token. |
| `4403` | Forbidden Origin | Origin header rejected by security policy. |
| `4408` | Idle Timeout | No traffic received within `WS_IDLE_TIMEOUT_SECONDS`. |
| `4429` | Rate Limit / Oversize | Rate limit (>10 msgs/s) or max size (>4KB) exceeded. |

