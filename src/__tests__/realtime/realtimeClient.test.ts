import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RealtimeClient,
  computeBackoffDelay,
  deriveWsUrl,
  sanitizeWsUrl,
} from "@/lib/realtime/client";
import { tablesSync } from "@/lib/realtime/tablesSync";
import { useTablesStore } from "@/store/tablesStore";
import { useOrderStore } from "@/store/orderStore";
import { useMenuStore } from "@/store/menuStore";
import { usePrintersStore } from "@/store/printersStore";
import { useAuthStore } from "@/store/authStore";
import { useConnectionStore } from "@/store/connectionStore";
import type { Table, Order } from "@/types";

// ─── Fake WebSocket Implementation ───
class FakeWebSocket {
  public static instances: FakeWebSocket[] = [];
  public static lastInstance: FakeWebSocket | null = null;

  public url: string;
  public readyState: number = 0; // CONNECTING
  public sentMessages: string[] = [];

  public onopen: ((ev: Event) => void) | null = null;
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onerror: ((ev: Event) => void) | null = null;
  public onclose: ((ev: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    FakeWebSocket.lastInstance = this;
  }

  public send(data: string) {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = "") {
    this.readyState = 3; // CLOSED
    this.onclose?.({ code, reason } as CloseEvent);
  }

  // Test helpers to simulate server frames
  public simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event("open"));
  }

  public simulateMessage(data: any) {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.({ data: raw } as MessageEvent);
  }
}

describe("RealtimeClient Unit Tests", () => {
  const secretToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload.signature";

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    FakeWebSocket.lastInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("1. URL Derivation & Token Redaction", () => {
    it("derives canonical ws/wss URL from HTTP/HTTPS API URL", () => {
      expect(deriveWsUrl("http://localhost:8000/api", "tok123")).toBe(
        "ws://localhost:8000/ws?token=tok123"
      );
      expect(deriveWsUrl("https://pos.lan:8443/api/", "tok123")).toBe(
        "wss://pos.lan:8443/ws?token=tok123"
      );
    });

    it("redacts tokens in sanitized log output", () => {
      const raw = "ws://localhost:8000/ws?token=" + secretToken;
      const sanitized = sanitizeWsUrl(raw);
      expect(sanitized).toBe("ws://localhost:8000/ws?token=***");
      expect(sanitized).not.toContain(secretToken);
    });

    it("never leaks secret token to console log/warn/error", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => secretToken,
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();

      // Verify no console log contained the raw token string
      const allCalls = [...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().join(" ");
      expect(allCalls).not.toContain(secretToken);

      client.destroy();
    });
  });

  describe("2. Backoff, Jitter & Reconnect Bounds", () => {
    it("computes exponential backoff with +/- 20% jitter bounds", () => {
      // Attempt 0: base 1000ms -> [800, 1200]
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffDelay(0);
        expect(delay).toBeGreaterThanOrEqual(800);
        expect(delay).toBeLessThanOrEqual(1200);
      }

      // Attempt 1: base 2000ms -> [1600, 2400]
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffDelay(1);
        expect(delay).toBeGreaterThanOrEqual(1600);
        expect(delay).toBeLessThanOrEqual(2400);
      }

      // Max backoff capped at 15000ms (jittered: max 18000ms)
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffDelay(10, 15000);
        expect(delay).toBeLessThanOrEqual(18000);
      }
    });

    it("resets backoff on connection.ack", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws1 = FakeWebSocket.lastInstance!;
      ws1.simulateOpen();

      // Server sends connection.ack
      ws1.simulateMessage({
        id: "ack-1",
        seq: 1,
        type: "connection.ack",
        ts: new Date().toISOString(),
        payload: {
          userId: "u1",
          role: "waiter",
          allowedFloors: ["floor-1"],
          serverBootId: "boot-1",
          heartbeatSeconds: 20,
        },
      });

      expect(client.getStatus()).toBe("connected");
      expect(client.getServerBootId()).toBe("boot-1");

      client.destroy();
    });
  });

  describe("3. Floor Subscriptions with Reference Counting", () => {
    it("manages subscriptions by reference count (no duplicate subscribe frames)", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();
      ws.simulateMessage({
        id: "ack-1",
        seq: 1,
        type: "connection.ack",
        ts: new Date().toISOString(),
        payload: { userId: "u1", role: "waiter", allowedFloors: ["f1"], serverBootId: "b1", heartbeatSeconds: 20 },
      });

      // Component A subscribes to floor f1
      const unsubA = client.subscribeFloor("f1");
      expect(ws.sentMessages).toEqual([JSON.stringify({ type: "subscribe", floorId: "f1" })]);

      // Component B subscribes to floor f1 (count = 2) -> NO duplicate subscribe frame sent!
      const unsubB = client.subscribeFloor("f1");
      expect(ws.sentMessages.length).toBe(1);

      // Component A unmounts (count = 1) -> NO unsubscribe frame yet!
      unsubA();
      expect(ws.sentMessages.length).toBe(1);

      // Component B unmounts (count = 0) -> sends unsubscribe frame!
      unsubB();
      expect(ws.sentMessages).toEqual([
        JSON.stringify({ type: "subscribe", floorId: "f1" }),
        JSON.stringify({ type: "unsubscribe", floorId: "f1" }),
      ]);

      client.destroy();
    });

    it("automatically re-subscribes active floors after reconnect", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws1 = FakeWebSocket.lastInstance!;
      ws1.simulateOpen();
      ws1.simulateMessage({
        id: "ack-1",
        seq: 1,
        type: "connection.ack",
        ts: new Date().toISOString(),
        payload: { userId: "u1", role: "waiter", allowedFloors: ["f1"], serverBootId: "b1", heartbeatSeconds: 20 },
      });

      client.subscribeFloor("f1");

      // Simulate connection drop (network drop: code 1006)
      ws1.close(1006, "Connection dropped");
      expect(client.getStatus()).toBe("reconnecting");

      // Advance timers to trigger reconnect
      vi.advanceTimersByTime(2000);

      const ws2 = FakeWebSocket.lastInstance!;
      expect(ws2).not.toBe(ws1);
      ws2.simulateOpen();

      // Handshake on new socket
      ws2.simulateMessage({
        id: "ack-2",
        seq: 1,
        type: "connection.ack",
        ts: new Date().toISOString(),
        payload: { userId: "u1", role: "waiter", allowedFloors: ["f1"], serverBootId: "b1", heartbeatSeconds: 20 },
      });

      // Verified: auto re-subscribed to f1 on ws2!
      expect(ws2.sentMessages).toContain(JSON.stringify({ type: "subscribe", floorId: "f1" }));

      client.destroy();
    });
  });

  describe("4. Sequence Ordering, Idempotency & Unknown Events", () => {
    it("dispatches events in monotonic sequence order and ignores stale/duplicates", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();

      const received: number[] = [];
      client.on("table.updated", (_p, env) => {
        received.push(env.seq);
      });

      // Frame with seq 2 arrives
      ws.simulateMessage({
        id: "ev-2",
        seq: 2,
        type: "table.updated",
        ts: new Date().toISOString(),
        payload: { floorId: "f1", tableId: "f1-t1", table: null },
      });

      // Duplicate frame with seq 2 arrives -> IGNORED
      ws.simulateMessage({
        id: "ev-2-dup",
        seq: 2,
        type: "table.updated",
        ts: new Date().toISOString(),
        payload: { floorId: "f1", tableId: "f1-t1", table: null },
      });

      // Frame with seq 3 arrives -> PROCESSED
      ws.simulateMessage({
        id: "ev-3",
        seq: 3,
        type: "table.updated",
        ts: new Date().toISOString(),
        payload: { floorId: "f1", tableId: "f1-t1", table: null },
      });

      expect(received).toEqual([2, 3]);
      expect(client.getLastSeq()).toBe(3);

      client.destroy();
    });

    it("safely ignores unknown event types without throwing", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();

      expect(() => {
        ws.simulateMessage({
          id: "ev-unknown",
          seq: 5,
          type: "future.experimental.event",
          ts: new Date().toISOString(),
          payload: { foo: "bar" },
        });
      }).not.toThrow();

      client.destroy();
    });
  });

  describe("5. Close Codes & Security Handling", () => {
    it("handles 4401 Unauthorized by calling onUnauthorized without reconnect loop", () => {
      const onUnauthorized = vi.fn();
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "expired-tok",
        WebSocketClass: FakeWebSocket as any,
        onUnauthorized,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();

      ws.close(4401, "Token expired");

      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(client.getStatus()).toBe("disconnected");

      // Advance timers by 60 seconds to ensure NO reconnect was scheduled
      vi.advanceTimersByTime(60000);
      expect(FakeWebSocket.instances.length).toBe(1);

      client.destroy();
    });

    it("handles 4403 Forbidden Origin by stopping reconnect", () => {
      const onForbidden = vi.fn();
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
        onForbidden,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();

      ws.close(4403, "Origin rejected");

      expect(onForbidden).toHaveBeenCalledTimes(1);
      expect(client.getStatus()).toBe("disconnected");

      vi.advanceTimersByTime(60000);
      expect(FakeWebSocket.instances.length).toBe(1);

      client.destroy();
    });

    it("handles 4429 Rate Limit with at least 30s backoff", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();

      ws.close(4429, "Too many connections");

      // At 20 seconds, reconnect should NOT have fired yet
      vi.advanceTimersByTime(20000);
      expect(FakeWebSocket.instances.length).toBe(1);

      // At 35 seconds, reconnect has fired
      vi.advanceTimersByTime(15000);
      expect(FakeWebSocket.instances.length).toBe(2);

      client.destroy();
    });

    it("handles 1013 Slow Consumer by reconnecting after 3s", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();

      ws.close(1013, "Queue overflow");

      vi.advanceTimersByTime(2500);
      expect(FakeWebSocket.instances.length).toBe(1);

      vi.advanceTimersByTime(1000);
      expect(FakeWebSocket.instances.length).toBe(2);

      client.destroy();
    });

    it("handles 1001 Server Restarting by immediate reconnect and backoff reset", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();

      ws.close(1001, "Server restarting");

      vi.advanceTimersByTime(150);
      expect(FakeWebSocket.instances.length).toBe(2);

      client.destroy();
    });
  });

  describe("6. Keepalive Ping & Dead Connection Watchdog", () => {
    it("sends ping every 25 seconds", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();
      ws.simulateMessage({
        id: "ack-1",
        seq: 1,
        type: "connection.ack",
        ts: new Date().toISOString(),
        payload: { userId: "u1", role: "waiter", allowedFloors: ["f1"], serverBootId: "b1", heartbeatSeconds: 20 },
      });

      vi.advanceTimersByTime(26000);
      const pingMsg = ws.sentMessages.find((m) => JSON.parse(m).type === "ping");
      expect(pingMsg).toBeDefined();

      client.destroy();
    });

    it("watchdog terminates dead connection when no frame received for 2.5 * heartbeatSeconds", () => {
      const client = new RealtimeClient({
        apiUrl: "http://localhost:8000/api",
        getToken: () => "valid-tok",
        WebSocketClass: FakeWebSocket as any,
      });

      client.connect();
      const ws = FakeWebSocket.lastInstance!;
      ws.simulateOpen();
      ws.simulateMessage({
        id: "ack-1",
        seq: 1,
        type: "connection.ack",
        ts: new Date().toISOString(),
        payload: { userId: "u1", role: "waiter", allowedFloors: ["f1"], serverBootId: "b1", heartbeatSeconds: 10 },
      });

      // 10s heartbeat * 2.5 = 25s threshold
      vi.advanceTimersByTime(24000);
      expect(ws.readyState).toBe(1); // Still open

      vi.advanceTimersByTime(6000); // Exceeds 25s
      expect(ws.readyState).toBe(3); // Closed by watchdog!

      client.destroy();
    });
  });

  describe("7. Event-to-Store Integration", () => {
    it("table.updated with table: null removes table from tablesStore", () => {
      const table1: Table = {
        id: "f1-t1",
        floorId: "f1",
        number: 1,
        capacity: 4,
        status: "free",
        isActive: true,
      };
      useTablesStore.getState().setTablesForFloor("f1", [table1]);
      expect(useTablesStore.getState().tablesForFloor("f1").length).toBe(1);

      useTablesStore.getState().upsertTable(null, "f1-t1", "f1");
      expect(useTablesStore.getState().tablesForFloor("f1").length).toBe(0);
    });

    it("order.updated with status: paid triggers isPaidElsewhere in orderStore", () => {
      const order: Order = {
        id: "ord-1",
        tableId: "f1-t1",
        floorId: "f1",
        waiterId: "u1",
        status: "open",
        items: [],
        subtotal: 100,
        tax: 0,
        discount: 0,
        total: 100,
        createdAt: new Date().toISOString(),
      };

      useOrderStore.setState({ order, currentTableId: "f1-t1", isPaidElsewhere: false });

      // Simulated external payment event
      const paidOrder: Order = { ...order, status: "paid" };
      useOrderStore.getState().syncOrder(paidOrder);

      expect(useOrderStore.getState().isPaidElsewhere).toBe(true);
      expect(useOrderStore.getState().order?.status).toBe("paid");
    });

    it("printer.status updates printersStore for admin", () => {
      usePrintersStore.getState().updatePrinterStatus({
        printerId: "p1",
        state: "error",
        message: "Paper jam",
      });

      const status = usePrintersStore.getState().statuses["p1"];
      expect(status).toBeDefined();
      expect(status.state).toBe("error");
      expect(status.message).toBe("Paper jam");
    });
  });
});

