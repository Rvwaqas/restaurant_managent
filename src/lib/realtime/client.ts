import type {
  ClientMessage,
  ServerEnvelope,
  ConnectionAckPayload,
  SubscribedPayload,
  TableUpdatedPayload,
  OrderUpdatedPayload,
  BillPaidPayload,
  MenuChangedPayload,
  PrinterStatusPayload,
  EventListener,
  RealtimeStatus,
} from "./types";

export interface RealtimeClientOptions {
  apiUrl: string;
  getToken: () => string | null;
  WebSocketClass?: typeof WebSocket;
  onStatusChange?: (status: RealtimeStatus) => void;
  onServerRestart?: (newBootId: string, oldBootId: string) => void;
  onUnauthorized?: () => void;
  onForbidden?: (reason: string) => void;
}

/**
 * Calculates exponential backoff delay with random jitter (+/- 20%).
 * Attempts 0: ~1000ms (800 - 1200ms)
 * Attempts 1: ~2000ms (1600 - 2400ms)
 * Attempts 2: ~4000ms (3200 - 4800ms)
 * Attempts 3: ~8000ms (6400 - 9600ms)
 * Attempts 4+: ~15000ms (12000 - 18000ms max)
 */
export function computeBackoffDelay(attempt: number, maxDelayMs = 15000): number {
  const base = Math.min(1000 * Math.pow(2, attempt), maxDelayMs);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(base * jitter);
}

/**
 * Derives the canonical WebSocket URL from the HTTP API URL.
 * e.g. "http://localhost:8000/api" -> "ws://localhost:8000/ws?token=..."
 */
export function deriveWsUrl(apiUrl: string, token: string): string {
  let base = apiUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  base = base.replace(/\/api\/?$/i, "");
  base = base.replace(/\/+$/, "");
  return `${base}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Redacts tokens from WebSocket URLs for safe logging.
 */
export function sanitizeWsUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]+/i, "$1***");
}

export class RealtimeClient {
  private apiUrl: string;
  private getToken: () => string | null;
  private WebSocketClass: typeof WebSocket;

  private ws: WebSocket | null = null;
  private status: RealtimeStatus = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private watchdogTimer: any = null;

  private serverBootId: string | null = null;
  private heartbeatSeconds = 20;
  private lastMessageReceivedAt = 0;
  private lastSeq = 0;

  // Floor subscriptions reference counting
  private floorRefCounts = new Map<string, number>();

  // Event listeners
  private listeners = new Map<string, Set<EventListener>>();

  // Callbacks
  private onStatusChange?: (status: RealtimeStatus) => void;
  private onServerRestart?: (newBootId: string, oldBootId: string) => void;
  private onUnauthorized?: () => void;
  private onForbidden?: (reason: string) => void;

  private isDisposed = false;
  private isPaused = false;

  constructor(options: RealtimeClientOptions) {
    this.apiUrl = options.apiUrl;
    this.getToken = options.getToken;
    this.WebSocketClass =
      options.WebSocketClass ||
      (typeof WebSocket !== "undefined" ? WebSocket : (null as any));
    this.onStatusChange = options.onStatusChange;
    this.onServerRestart = options.onServerRestart;
    this.onUnauthorized = options.onUnauthorized;
    this.onForbidden = options.onForbidden;

    // Attach browser tab visibility listener
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  public getStatus(): RealtimeStatus {
    return this.status;
  }

  public getServerBootId(): string | null {
    return this.serverBootId;
  }

  public getLastSeq(): number {
    return this.lastSeq;
  }

  private setStatus(newStatus: RealtimeStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.onStatusChange?.(newStatus);
      const listeners = this.listeners.get("statusChange");
      if (listeners) {
        listeners.forEach((fn) => {
          try {
            fn(newStatus, { type: "statusChange", payload: newStatus } as any);
          } catch {}
        });
      }
    }
  }

  /**
   * Connects the WebSocket gateway if not already connected.
   */
  public connect(): void {
    if (this.isDisposed || this.isPaused) return;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    const token = this.getToken();
    if (!token) {
      this.setStatus("disconnected");
      return;
    }

    if (!this.WebSocketClass) {
      console.warn("[RealtimeClient] WebSocket implementation unavailable in this environment.");
      return;
    }

    this.clearTimers();
    this.setStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    const rawUrl = deriveWsUrl(this.apiUrl, token);
    const safeUrl = sanitizeWsUrl(rawUrl);

    try {
      this.ws = new this.WebSocketClass(rawUrl);
    } catch (err) {
      console.error(`[RealtimeClient] Failed to create WebSocket to ${safeUrl}:`, err);
      this.scheduleReconnect(computeBackoffDelay(this.reconnectAttempts++));
      return;
    }

    this.ws.onopen = this.handleOpen;
    this.ws.onmessage = this.handleMessage;
    this.ws.onerror = this.handleError;
    this.ws.onclose = this.handleClose;
  }

  /**
   * Closes the active WebSocket connection cleanly and stops reconnect timers.
   */
  public disconnect(code = 1000, reason = "Client disconnect"): void {
    this.clearTimers();
    if (this.ws) {
      // Remove listeners to avoid trigger onclose logic
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close(code, reason);
      } catch {}
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  /**
   * Subscribes to real-time events for a specific floor using reference counting.
   * Returns an unsubscribe function.
   */
  public subscribeFloor(floorId: string): () => void {
    const currentCount = this.floorRefCounts.get(floorId) || 0;
    this.floorRefCounts.set(floorId, currentCount + 1);

    if (currentCount === 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "subscribe", floorId });
    }

    return () => {
      const cnt = this.floorRefCounts.get(floorId) || 0;
      if (cnt <= 1) {
        this.floorRefCounts.delete(floorId);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send({ type: "unsubscribe", floorId });
        }
      } else {
        this.floorRefCounts.set(floorId, cnt - 1);
      }
    };
  }

  /**
   * Registers an event listener for a canonical message type.
   */
  public on<T = any>(eventType: string, listener: EventListener<T>): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(listener);

    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }

  /**
   * Sends a JSON command frame to the server.
   */
  public send(msg: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        return true;
      } catch (err) {
        console.warn("[RealtimeClient] Send error:", err);
        return false;
      }
    }
    return false;
  }

  private handleOpen = () => {
    this.lastMessageReceivedAt = Date.now();
    this.lastSeq = 0;
    // We stay in 'connecting'/'reconnecting' until 'connection.ack' arrives
  };

  private handleMessage = (event: MessageEvent) => {
    this.lastMessageReceivedAt = Date.now();

    let envelope: ServerEnvelope;
    try {
      envelope = JSON.parse(event.data);
    } catch {
      // Ignore unparseable frames safely
      return;
    }

    if (!envelope || typeof envelope !== "object" || !envelope.type) {
      return;
    }

    // Monotonic sequence verification: ignore duplicates per connection
    if (typeof envelope.seq === "number") {
      if (envelope.seq <= this.lastSeq) {
        // Stale or duplicate frame -> ignore idempotently
        return;
      }
      this.lastSeq = envelope.seq;
    }

    // Core internal protocol frames
    if (envelope.type === "connection.ack") {
      this.handleConnectionAck(envelope.payload as ConnectionAckPayload);
      return;
    }

    if (envelope.type === "pong" || envelope.type === "heartbeat") {
      // Keepalive acknowledgments
      return;
    }

    // Dispatch to registered event listeners
    const listeners = this.listeners.get(envelope.type);
    if (listeners) {
      listeners.forEach((fn) => {
        try {
          fn(envelope.payload, envelope);
        } catch (err) {
          console.error(`[RealtimeClient] Error in listener for ${envelope.type}:`, err);
        }
      });
    }
  };

  private handleConnectionAck(payload: ConnectionAckPayload) {
    this.reconnectAttempts = 0;
    this.setStatus("connected");

    if (payload.heartbeatSeconds) {
      this.heartbeatSeconds = payload.heartbeatSeconds;
    }

    // Check for server restart
    if (payload.serverBootId) {
      if (this.serverBootId && this.serverBootId !== payload.serverBootId) {
        const oldId = this.serverBootId;
        this.serverBootId = payload.serverBootId;
        this.onServerRestart?.(payload.serverBootId, oldId);
      } else {
        this.serverBootId = payload.serverBootId;
      }
    }

    // Automatically re-subscribe to all active floors
    for (const [floorId, count] of this.floorRefCounts.entries()) {
      if (count > 0) {
        this.send({ type: "subscribe", floorId });
      }
    }

    // Start keepalive ping & watchdog
    this.startPingAndWatchdog();
  }

  private handleError = (_event: Event) => {
    // WebSocket errors trigger onclose immediately after; no action needed here
  };

  private handleClose = (event: CloseEvent) => {
    this.clearTimers();
    this.ws = null;
    this.setStatus("disconnected");

    const code = event.code;

    // 4401: Unauthorized -> Session expired, redirect to login, do NOT loop
    if (code === 4401) {
      console.warn("[RealtimeClient] Authentication rejected (4401 Unauthorized). Stopping reconnection.");
      this.onUnauthorized?.();
      return;
    }

    // 4403: Forbidden Origin -> Misconfigured security policy, stop reconnecting
    if (code === 4403) {
      console.error("[RealtimeClient] Connection rejected: Forbidden origin (4403).");
      this.onForbidden?.("Forbidden origin");
      return;
    }

    // 4429: Too Many Connections or Rate Limit -> Backoff at least 30s
    if (code === 4429) {
      const delay = Math.max(30000, computeBackoffDelay(this.reconnectAttempts++));
      this.scheduleReconnect(delay);
      return;
    }

    // 1013: Send Queue Overflow (Slow consumer) -> Reconnect after 3s
    if (code === 1013) {
      this.scheduleReconnect(3000);
      return;
    }

    // 1001: Server Restarting -> Reconnect immediately with reset backoff
    if (code === 1001) {
      this.reconnectAttempts = 0;
      this.scheduleReconnect(100);
      return;
    }

    // 1000: Normal clean closure
    if (code === 1000) {
      return;
    }

    // All other codes: exponential backoff with jitter
    const delay = computeBackoffDelay(this.reconnectAttempts++);
    this.scheduleReconnect(delay);
  };

  private scheduleReconnect(delayMs: number) {
    if (this.isDisposed || this.isPaused) return;
    this.clearTimers();
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  private startPingAndWatchdog() {
    this.clearTimers();

    // Periodic ping every 25s
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping", clientTs: Date.now() });
    }, 25000);

    // Dead-connection watchdog: check every 5s if last message > 2.5 * heartbeatSeconds
    const deadThresholdMs = this.heartbeatSeconds * 2.5 * 1000;
    this.watchdogTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const elapsed = Date.now() - this.lastMessageReceivedAt;
        if (elapsed > deadThresholdMs) {
          console.warn(`[RealtimeClient] Dead connection detected (${elapsed}ms without message). Reconnecting...`);
          try {
            this.ws.close(4408, "Dead connection watchdog timeout");
          } catch {}
        }
      }
    }, 5000);
  }

  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private handleVisibilityChange = () => {
    if (typeof document === "undefined") return;

    if (document.visibilityState === "hidden") {
      this.isPaused = true;
      // Close socket or stop timers while tab is inactive
      this.disconnect(1000, "Tab hidden");
    } else if (document.visibilityState === "visible") {
      this.isPaused = false;
      // Resume connection and re-sync
      this.connect();
    }
  };

  public destroy(): void {
    this.isDisposed = true;
    this.disconnect();
    this.listeners.clear();
    this.floorRefCounts.clear();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }
}
