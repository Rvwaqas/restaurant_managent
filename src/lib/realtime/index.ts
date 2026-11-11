import { RealtimeClient } from "./client";
import { env } from "@/config/env";
import { useAuthStore } from "@/store/authStore";
import { useTablesStore } from "@/store/tablesStore";
import { useOrderStore } from "@/store/orderStore";
import { useMenuStore } from "@/store/menuStore";
import { usePrintersStore } from "@/store/printersStore";
import { useBillsStore } from "@/store/billsStore";
import { useReportsStore } from "@/store/reportsStore";
import { useConnectionStore } from "@/store/connectionStore";
import { clearSessionCookies } from "@/lib/auth/session";
import { toast } from "sonner";
import type {
  SubscribedPayload,
  TableUpdatedPayload,
  OrderUpdatedPayload,
  BillPaidPayload,
  MenuChangedPayload,
  PrinterStatusPayload,
} from "./types";

export * from "./types";
export * from "./client";
export * from "./tablesSync";

let singletonClient: RealtimeClient | null = null;
let isInitialized = false;

export function getRealtimeClient(): RealtimeClient {
  if (!singletonClient) {
    singletonClient = new RealtimeClient({
      apiUrl: env.apiUrl,
      getToken: () => {
        // Read token from localStorage / zustand auth storage
        if (typeof window === "undefined") return null;
        try {
          const authData = localStorage.getItem("auth-storage");
          if (authData) {
            const parsed = JSON.parse(authData);
            return parsed?.state?.token || null;
          }
        } catch {}
        return useAuthStore.getState().user ? (useAuthStore.getState() as any).token || null : null;
      },
      onStatusChange: (status) => {
        useConnectionStore.getState().setWsStatus(status);
      },
      onServerRestart: (_newBootId, _oldBootId) => {
        toast.info("Server restarted", {
          description: "Re-syncing table and menu status...",
          duration: 3000,
        });
        // Clear cached menus and reload
        useMenuStore.getState().clearCache();
      },
      onUnauthorized: () => {
        if (typeof window !== "undefined") {
          toast.error("Session expired", {
            description: "Please sign in again to continue.",
            duration: 4000,
          });
          clearSessionCookies();
          localStorage.removeItem("auth-storage");
          if (!window.location.pathname.startsWith("/login")) {
            const currentPath = window.location.pathname + window.location.search;
            window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
          }
        }
      },
      onForbidden: (reason) => {
        toast.error("Realtime Access Error", {
          description: reason || "Forbidden origin or permission denied.",
        });
      },
    });

    // Wire canonical event listeners to application state stores
    setupStoreEventBindings(singletonClient);
  }

  return singletonClient;
}

function setupStoreEventBindings(client: RealtimeClient) {
  // 1. table.updated -> update table in tablesStore
  client.on<TableUpdatedPayload>("table.updated", (payload) => {
    useTablesStore.getState().upsertTable(payload.table, payload.tableId, payload.floorId);
  });

  // 2. subscribed -> initial floor table snapshot
  client.on<SubscribedPayload>("subscribed", (payload) => {
    useTablesStore.getState().setTablesForFloor(payload.floorId, payload.tables);
  });

  // 3. order.updated -> update active open order in orderStore
  client.on<OrderUpdatedPayload>("order.updated", (payload) => {
    if (payload.order) {
      useOrderStore.getState().syncOrder(payload.order);
    }
  });

  // 4. bill.paid -> mark table free, trigger external payment check, refresh bills
  client.on<BillPaidPayload>("bill.paid", (payload) => {
    // If user is currently looking at this order / table:
    const activeOrder = useOrderStore.getState().order;
    const currentTableId = useOrderStore.getState().currentTableId;
    if (
      activeOrder &&
      activeOrder.status === "open" &&
      (activeOrder.id === payload.orderId || activeOrder.tableId === payload.tableId || currentTableId === payload.tableId)
    ) {
      useOrderStore.getState().setPaidElsewhere(true);
    }

    // Refresh bills list if bills store has loaded items
    try {
      useBillsStore.getState().fetchBills();
    } catch {}

    // Refresh reports if open
    try {
      useReportsStore.getState().fetchOverview();
    } catch {}
  });

  // 5. menu.changed -> invalidate and refetch floor menu
  client.on<MenuChangedPayload>("menu.changed", (payload) => {
    if (payload.floorId) {
      useMenuStore.getState().fetchFloorMenu(payload.floorId, true);
    }
  });

  // 6. printer.status -> update admin printers store (Admin only)
  client.on<PrinterStatusPayload>("printer.status", (payload) => {
    const user = useAuthStore.getState().user;
    if (user?.role === "admin") {
      usePrintersStore.getState().updatePrinterStatus(payload);
    }
  });
}

/**
 * Automatically initializes and connects the WebSocket client when enabled and authenticated.
 */
export function initRealtime(): () => void {
  if (typeof window === "undefined" || !env.wsEnabled || isInitialized) {
    return () => {};
  }
  isInitialized = true;

  const client = getRealtimeClient();

  // If user is authenticated, connect immediately
  const checkAuthAndConnect = () => {
    const user = useAuthStore.getState().user;
    if (user) {
      client.connect();
    } else {
      client.disconnect();
    }
  };

  checkAuthAndConnect();

  // Listen to auth changes
  const unsubscribeAuth = useAuthStore.subscribe((state, prevState) => {
    if (state.user && !prevState.user) {
      client.connect();
    } else if (!state.user && prevState.user) {
      client.disconnect(1000, "User logged out");
    }
  });

  return () => {
    unsubscribeAuth();
    client.destroy();
    singletonClient = null;
    isInitialized = false;
  };
}

export const realtimeClient = typeof window !== "undefined" ? getRealtimeClient() : (null as any);

