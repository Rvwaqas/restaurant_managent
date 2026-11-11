import type { Table } from "@/types";
import { tablesService } from "@/lib/api/services";
import { env } from "@/config/env";
import { getRealtimeClient } from "./index";
import { useAuthStore } from "@/store/authStore";
import { useTablesStore } from "@/store/tablesStore";
import type { SubscribedPayload, TableUpdatedPayload, RealtimeStatus } from "./types";

export type TablesUpdateCallback = (tables: Table[]) => void;
export type SyncErrorCallback = (error: Error) => void;

export interface TablesSyncService {
  subscribe: (
    floorId: string,
    onUpdate: TablesUpdateCallback,
    onError?: SyncErrorCallback
  ) => () => void;
}

/**
 * Realtime WebSocket implementation of TablesSyncService with polling fallback.
 * - When WebSocket is connected: fast polling is paused; a slow safety refresh runs every 60s.
 * - When WebSocket is disconnected/reconnecting or WS disabled: falls back to 5s polling.
 * - Automatically pauses polling when tab is hidden and resumes with a fresh snapshot when visible.
 */
class HybridTablesSyncService implements TablesSyncService {
  private fallbackPollMs = 5000;
  private safetyRefreshMs = 60000;

  subscribe(
    floorId: string,
    onUpdate: TablesUpdateCallback,
    onError?: SyncErrorCallback
  ): () => void {
    let isDisposed = false;
    let isFetching = false;
    let pollTimer: any = null;

    // Check user floor authorization (Waiters only subscribe to allowed floors)
    const currentUser = useAuthStore.getState().user;
    const allowedFloors = (currentUser?.allowedFloors || []) as string[];
    const isAllowed =
      !currentUser?.allowedFloors ||
      currentUser.role === "admin" ||
      allowedFloors.includes(floorId) ||
      (floorId === "f1" && allowedFloors.includes("floor-1")) ||
      (floorId === "f2" && allowedFloors.includes("floor-2")) ||
      (floorId === "floor-1" && allowedFloors.includes("f1")) ||
      (floorId === "floor-2" && allowedFloors.includes("f2"));

    if (currentUser && currentUser.role !== "admin" && !isAllowed) {
      onError?.(new Error(`User unauthorized to subscribe to floor ${floorId}`));
      return () => {};
    }

    const poll = async () => {
      if (isDisposed || isFetching) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return; // Pause while screen/tab is inactive
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }

      isFetching = true;
      try {
        const tables = await tablesService.listByFloor(floorId);
        if (!isDisposed) {
          onUpdate(tables);
        }
      } catch (err: unknown) {
        if (!isDisposed && onError) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        isFetching = false;
      }
    };

    // Determine polling interval based on socket health
    const scheduleNextPoll = () => {
      if (isDisposed) return;
      if (pollTimer) clearTimeout(pollTimer);

      const client = typeof window !== "undefined" ? getRealtimeClient() : null;
      const wsConnected = env.wsEnabled && client?.getStatus() === "connected";
      const intervalMs = wsConnected ? this.safetyRefreshMs : this.fallbackPollMs;

      pollTimer = setTimeout(async () => {
        await poll();
        scheduleNextPoll();
      }, intervalMs);
    };

    // 1. Initial fetch if no cached tables exist
    const cached = useTablesStore.getState().tablesForFloor(floorId);
    if (cached.length === 0) {
      poll().then(() => scheduleNextPoll());
    } else {
      onUpdate(cached);
      scheduleNextPoll();
    }

    // 2. Setup WebSocket subscriptions if enabled
    let unsubFloor = () => {};
    let unsubSubscribed = () => {};
    let unsubTableUpdated = () => {};
    let unsubStatus = () => {};

    if (env.wsEnabled && typeof window !== "undefined") {
      const client = getRealtimeClient();

      // Ensure client is connected
      client.connect();

      // Floor subscription with reference counting
      unsubFloor = client.subscribeFloor(floorId);

      // Listen for subscribed snapshot
      unsubSubscribed = client.on<SubscribedPayload>("subscribed", (payload) => {
        if (payload.floorId === floorId && !isDisposed) {
          onUpdate(payload.tables);
        }
      });

      // Listen for individual table updates
      unsubTableUpdated = client.on<TableUpdatedPayload>("table.updated", (payload) => {
        if (payload.floorId === floorId && !isDisposed) {
          // Deliver updated floor tables list
          const currentTables = useTablesStore.getState().tablesForFloor(floorId);
          onUpdate(currentTables);
        }
      });

      // Switch polling interval when socket transitions between connected and fallback
      unsubStatus = client.on("statusChange", () => {
        if (!isDisposed) {
          scheduleNextPoll();
        }
      });
    }

    // 3. Tab visibility handling
    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        const client = typeof window !== "undefined" ? getRealtimeClient() : null;
        if (env.wsEnabled && client?.getStatus() === "connected") {
          // Re-request floor snapshot over WebSocket
          client.send({ type: "subscribe", floorId });
        } else {
          // Fallback poll immediately
          poll();
        }
        scheduleNextPoll();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // Cleanup function
    return () => {
      isDisposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      unsubFloor();
      unsubSubscribed();
      unsubTableUpdated();
      unsubStatus();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }
}

export const tablesSync: TablesSyncService = new HybridTablesSyncService();
