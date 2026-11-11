import { create } from "zustand";
import type { Order, PaymentMethod, PrintJob, ListPaidQuery } from "@/types";
import { ordersService } from "@/lib/api/services";

interface BillsFilters {
  date?: string;
  floorId?: string;
  paymentMethod?: PaymentMethod;
  search?: string;
}

interface BillsState {
  bills: Order[];
  items: Order[];
  total: number;
  totalAmount: number;
  page: number;
  limit: number;
  filters: BillsFilters;
  status: "idle" | "loading" | "error";
  error: string | null;

  fetchBills: () => Promise<void>;
  totalRevenue: () => number;
  setFilters: (filters: Partial<BillsFilters>) => void;
  setPage: (page: number) => void;
  reprintBill: (orderId: string) => Promise<PrintJob>;
}

export const useBillsStore = create<BillsState>((set, get) => ({
  bills: [],
  items: [],
  total: 0,
  totalAmount: 0,
  page: 1,
  limit: 20,
  filters: {
    date: new Date().toISOString().split("T")[0], // default today
  },
  status: "idle",
  error: null,

  totalRevenue: () => get().totalAmount,

  fetchBills: async () => {
    set({ status: "loading", error: null });
    const { filters, page, limit } = get();

    const query: ListPaidQuery = {
      date: filters.date,
      floorId: filters.floorId,
      paymentMethod: filters.paymentMethod,
      search: filters.search,
      page,
      limit,
    };

    try {
      const response = await ordersService.listPaid(query);
      set({
        bills: response.items,
        items: response.items,
        total: response.total,
        totalAmount: response.totalAmount,
        status: "idle",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch bills";
      set({ status: "error", error: message });
    }
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1, // Reset to first page on filter change
    }));
    get().fetchBills();
  },

  setPage: (page) => {
    set({ page });
    get().fetchBills();
  },

  reprintBill: async (orderId: string) => {
    return await ordersService.reprintBill(orderId);
  },
}));

