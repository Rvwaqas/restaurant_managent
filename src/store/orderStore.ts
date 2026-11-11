import { create } from "zustand";
import type { Order, SendResult, PayRequest, PayResult, VoidItemRequest, VoidItemResult } from "@/types";
import { ordersService } from "@/lib/api/services";

interface OrderState {
  order: Order | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  lastUpdatedAt: string | null;
  currentTableId: string | null;
  isPaidElsewhere: boolean;

  load: (tableId: string) => Promise<Order | null>;
  silentRefresh: (tableId: string) => Promise<void>;
  syncOrder: (order: Order) => void;
  setPaidElsewhere: (paid: boolean) => void;
  applySendResult: (result: SendResult) => void;
  pay: (payload: PayRequest) => Promise<PayResult>;
  voidItem: (payload: VoidItemRequest) => Promise<VoidItemResult>;
  canPay: (hasDraftItems: boolean) => boolean;
  clear: () => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  order: null,
  status: "idle",
  error: null,
  lastUpdatedAt: null,
  currentTableId: null,
  isPaidElsewhere: false,

  load: async (tableId: string) => {
    set({ status: "loading", error: null, currentTableId: tableId });
    try {
      const order = await ordersService.getOpenByTable(tableId);
      set({
        order,
        status: "success",
        lastUpdatedAt: new Date().toISOString(),
      });
      return order;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load order";
      set({ status: "error", error: message });
      return null;
    }
  },

  silentRefresh: async (tableId: string) => {
    // Only refresh if still on the same table
    if (get().currentTableId !== tableId) return;

    try {
      const order = await ordersService.getOpenByTable(tableId);
      // Double check tableId hasn't changed during fetch
      if (get().currentTableId === tableId) {
        set({
          order,
          lastUpdatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Silent error: do not disrupt waiter during background polling
    }
  },

  setPaidElsewhere: (paid: boolean) => {
    set({ isPaidElsewhere: paid });
  },

  syncOrder: (order: Order) => {
    const current = get().order;
    const tableId = get().currentTableId;
    if ((current && (current.id === order.id || current.tableId === order.tableId)) || (tableId && tableId === order.tableId)) {
      if (order.status === "paid" && current && current.status === "open") {
        set({ isPaidElsewhere: true, order, lastUpdatedAt: new Date().toISOString() });
      } else {
        set({ order, lastUpdatedAt: new Date().toISOString(), status: "success" });
      }
    }
  },

  applySendResult: (result: SendResult) => {
    set({
      order: result.order,
      status: "success",
      lastUpdatedAt: new Date().toISOString(),
    });
  },

  pay: async (payload: PayRequest) => {
    set({ status: "loading", error: null });
    try {
      const result = await ordersService.pay(payload);
      set({
        order: result.order,
        isPaidElsewhere: false,
        status: "success",
        lastUpdatedAt: new Date().toISOString(),
      });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to process payment";
      set({ status: "error", error: message });
      throw err;
    }
  },

  voidItem: async (payload: VoidItemRequest) => {
    try {
      const result = await ordersService.voidItem(payload);
      set({
        order: result.order,
        lastUpdatedAt: new Date().toISOString(),
      });
      return result;
    } catch (err: unknown) {
      throw err;
    }
  },

  canPay: (hasDraftItems: boolean) => {
    const { order } = get();
    if (!order || order.status !== "open") return false;
    const activeItems = (order.items || []).filter((i) => !i.voided);
    if (activeItems.length === 0) return false;
    if (hasDraftItems) return false;
    return true;
  },

  clear: () => {
    set({
      order: null,
      status: "idle",
      error: null,
      lastUpdatedAt: null,
      currentTableId: null,
      isPaidElsewhere: false,
    });
  },
}));
