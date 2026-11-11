import { create } from "zustand";
import type { Printer, TestPrintResult, DeleteResult } from "@/types";
import { printersService } from "@/lib/api/services";

export interface PrinterRuntimeStatus {
  state: "ok" | "error" | "warning";
  message?: string;
  updatedAt: number;
}

export interface PrintersState {
  items: Printer[];
  statuses: Record<string, PrinterRuntimeStatus>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPrinters: () => Promise<Printer[]>;
  createPrinter: (printer: Omit<Printer, "id">) => Promise<Printer>;
  updatePrinter: (id: string, printer: Partial<Omit<Printer, "id">>) => Promise<Printer>;
  deletePrinter: (id: string) => Promise<DeleteResult>;
  testPrint: (id: string) => Promise<TestPrintResult>;
  updatePrinterStatus: (payload: { printerId: string; state: "ok" | "error" | "warning"; message?: string }) => void;

  // Selectors
  getActiveCashierPrinter: () => Printer | undefined;
  getKitchenPrinters: () => Printer[];
}

export const usePrintersStore = create<PrintersState>((set, get) => ({
  items: [],
  statuses: {},
  isLoading: false,
  error: null,

  fetchPrinters: async () => {
    set({ isLoading: true, error: null });
    try {
      const items = await printersService.list();
      set({ items, isLoading: false });
      return items;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load printers";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  createPrinter: async (payload) => {
    const created = await printersService.create(payload);
    set((state) => ({ items: [...state.items, created] }));
    return created;
  },

  updatePrinter: async (id, payload) => {
    const updated = await printersService.update(id, payload);
    set((state) => ({
      items: state.items.map((p) => (p.id === id ? updated : p)),
    }));
    return updated;
  },

  deletePrinter: async (id) => {
    const res = await printersService.remove(id);
    set((state) => ({
      items: state.items.filter((p) => p.id !== id),
    }));
    return res;
  },

  testPrint: async (id) => {
    return await printersService.testPrint(id);
  },

  updatePrinterStatus: ({ printerId, state: statusState, message }) => {
    set((state) => ({
      statuses: {
        ...state.statuses,
        [printerId]: { state: statusState, message, updatedAt: Date.now() },
      },
    }));
  },

  getActiveCashierPrinter: () => {
    return get().items.find((p) => p.role === "cashier" && p.isActive);
  },

  getKitchenPrinters: () => {
    return get().items.filter((p) => p.role === "kitchen");
  },
}));

