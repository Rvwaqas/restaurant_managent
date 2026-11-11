import { create } from "zustand";
import { toast } from "sonner";
import type { RealtimeStatus } from "@/lib/realtime/types";
import { env } from "@/config/env";

export type ConnectionStatus = "online" | "unstable" | "offline";

interface ConnectionState {
  status: ConnectionStatus;
  consecutiveFailures: number;
  lastOnlineAt: number;
  lastStatusChangeAt: number;
  isBrowserOnline: boolean;
  wsStatus: RealtimeStatus;

  reportSuccess: () => void;
  reportFailure: () => void;
  setBrowserOnline: (isOnline: boolean) => void;
  setWsStatus: (wsStatus: RealtimeStatus) => void;
  checkStatus: () => ConnectionStatus;
}

// Track listeners to trigger data refetches on reconnect
type ReconnectListener = () => void | Promise<void>;
const reconnectListeners = new Set<ReconnectListener>();

export function onReconnect(listener: ReconnectListener): () => void {
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

export function triggerReconnectRefresh(): void {
  reconnectListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.warn("Failed to execute reconnect listener", err);
    }
  });
}

function resolveCompositeStatus(
  isBrowserOnline: boolean,
  httpFailures: number,
  wsStatus: RealtimeStatus
): ConnectionStatus {
  if (!isBrowserOnline || httpFailures >= 3) {
    return "offline";
  }

  // If HTTP has warnings OR socket is down/reconnecting while HTTP works
  if (httpFailures > 0) {
    return "unstable";
  }

  if (env.wsEnabled && wsStatus !== "connected") {
    // Socket down while HTTP is fine -> "unstable", NOT "offline"
    return "unstable";
  }

  return "online";
}

function notifyStatusTransition(prev: ConnectionStatus, next: ConnectionStatus) {
  if (prev === next) return;

  if (next === "online") {
    toast.success("Connection restored", {
      description: "Back online. Syncing latest data...",
      duration: 3000,
      id: "connection-status-toast",
    });
    triggerReconnectRefresh();
  } else if (next === "offline") {
    toast.error("You are offline", {
      description: "Orders cannot be sent until connection returns. Drafts are safe.",
      duration: 4000,
      id: "connection-status-toast",
    });
  } else if (next === "unstable" && prev === "online") {
    toast.warning("Network connection unstable", {
      description: "Requests are taking longer or real-time sync is reconnecting.",
      duration: 3000,
      id: "connection-status-toast",
    });
  }
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "online",
  consecutiveFailures: 0,
  lastOnlineAt: Date.now(),
  lastStatusChangeAt: Date.now(),
  isBrowserOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  wsStatus: "disconnected",

  checkStatus: () => get().status,

  reportSuccess: () => {
    const prev = get().status;
    const now = Date.now();
    const nextStatus = resolveCompositeStatus(get().isBrowserOnline, 0, get().wsStatus);

    notifyStatusTransition(prev, nextStatus);

    set({
      status: nextStatus,
      consecutiveFailures: 0,
      lastOnlineAt: now,
      lastStatusChangeAt: prev !== nextStatus ? now : get().lastStatusChangeAt,
    });
  },

  reportFailure: () => {
    const prev = get().status;
    const nextFailures = get().consecutiveFailures + 1;
    const now = Date.now();
    const nextStatus = resolveCompositeStatus(get().isBrowserOnline, nextFailures, get().wsStatus);

    notifyStatusTransition(prev, nextStatus);

    set({
      status: nextStatus,
      consecutiveFailures: nextFailures,
      lastStatusChangeAt: prev !== nextStatus ? now : get().lastStatusChangeAt,
    });
  },

  setBrowserOnline: (isOnline: boolean) => {
    const prev = get().status;
    const now = Date.now();
    const failures = isOnline ? 0 : Math.max(3, get().consecutiveFailures);
    const nextStatus = resolveCompositeStatus(isOnline, failures, get().wsStatus);

    notifyStatusTransition(prev, nextStatus);

    set({
      isBrowserOnline: isOnline,
      status: nextStatus,
      consecutiveFailures: failures,
      lastStatusChangeAt: prev !== nextStatus ? now : get().lastStatusChangeAt,
      lastOnlineAt: isOnline ? now : get().lastOnlineAt,
    });
  },

  setWsStatus: (wsStatus: RealtimeStatus) => {
    const prev = get().status;
    const now = Date.now();
    const nextStatus = resolveCompositeStatus(
      get().isBrowserOnline,
      get().consecutiveFailures,
      wsStatus
    );

    notifyStatusTransition(prev, nextStatus);

    set({
      wsStatus,
      status: nextStatus,
      lastStatusChangeAt: prev !== nextStatus ? now : get().lastStatusChangeAt,
    });
  },
}));

// Initialize global browser online/offline event listeners on client
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    useConnectionStore.getState().setBrowserOnline(true);
  });

  window.addEventListener("offline", () => {
    useConnectionStore.getState().setBrowserOnline(false);
  });
}
