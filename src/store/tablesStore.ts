import { create } from "zustand";
import type {
  Table,
  DeleteResult,
  BulkCreateTablesPayload,
  BulkCreateTablesResult,
} from "@/types";
import { tablesService } from "@/lib/api/services";

export type TablesSyncStatus = "idle" | "loading" | "refreshing" | "error";

export interface TablesState {
  // Items keyed by floorId, e.g. "f1" -> Table[]
  items: Record<string, Table[]>;
  status: TablesSyncStatus;
  lastUpdatedAt: Record<string, string | null>;
  error: string | null;
  // IDs of tables whose status changed in the last 1.5s (for highlight pulse)
  changedTableIds: string[];

  // Waiter & Sync Actions
  fetchFloor: (floorId: string, options?: { silent?: boolean }) => Promise<void>;
  setTablesForFloor: (floorId: string, newTables: Table[]) => void;
  upsertTable: (table: Table | null, tableId?: string, floorId?: string) => void;
  clearChangedTableIds: () => void;

  // Admin Actions
  createTable: (table: Omit<Table, "id">) => Promise<Table>;
  updateTable: (id: string, table: Partial<Omit<Table, "id">>) => Promise<Table>;
  deleteTable: (id: string, floorId: string) => Promise<DeleteResult>;
  bulkCreateTables: (
    floorId: string,
    payload: BulkCreateTablesPayload
  ) => Promise<BulkCreateTablesResult>;

  // Selectors
  tablesForFloor: (floorId: string) => Table[];
  counts: (floorId: string) => { total: number; free: number; occupied: number };
}

export const useTablesStore = create<TablesState>((set, get) => ({
  items: {},
  status: "idle",
  lastUpdatedAt: {},
  error: null,
  changedTableIds: [],

  clearChangedTableIds: () => {
    set({ changedTableIds: [] });
  },

  setTablesForFloor: (floorId: string, newTables: Table[]) => {
    const prevTables = get().items[floorId] || [];
    const prevStatusMap = new Map(prevTables.map((t) => [t.id, t.status]));
    const changedIds: string[] = [];

    // Detect which tables changed occupancy status
    if (prevTables.length > 0) {
      for (const t of newTables) {
        const oldStatus = prevStatusMap.get(t.id);
        if (oldStatus && oldStatus !== t.status) {
          changedIds.push(t.id);
        }
      }
    }

    set((state) => ({
      items: {
        ...state.items,
        [floorId]: newTables,
      },
      lastUpdatedAt: {
        ...state.lastUpdatedAt,
        [floorId]: new Date().toISOString(),
      },
      status: "idle",
      error: null,
      changedTableIds: changedIds.length > 0 ? changedIds : state.changedTableIds,
    }));

    // Auto-clear the highlight pulse after 1.5 seconds
    if (changedIds.length > 0) {
      setTimeout(() => {
        set({ changedTableIds: [] });
      }, 1500);
    }
  },

  fetchFloor: async (floorId: string, options = {}) => {
    const hasCached = (get().items[floorId] || []).length > 0;
    const isSilent = options.silent || hasCached;

    set({ status: isSilent ? "refreshing" : "loading", error: null });

    try {
      const tables = await tablesService.listByFloor(floorId);
      get().setTablesForFloor(floorId, tables);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load tables";
      set({ status: "error", error: message });
      throw err;
    }
  },

  upsertTable: (table: Table | null, tableId?: string, floorId?: string) => {
    // 1. Table deletion or deactivation (payload.table === null)
    if (!table) {
      if (!floorId || !tableId) return;
      const current = get().items[floorId] || [];
      const updated = current.filter((t) => t.id !== tableId);
      get().setTablesForFloor(floorId, updated);
      return;
    }

    const fid = table.floorId || floorId;
    if (!fid) return;
    const current = get().items[fid] || [];
    const index = current.findIndex((t) => t.id === table.id);

    // 2. Own-action echo check: if content is identical, do not trigger re-render / highlight
    if (index >= 0) {
      const existing = current[index];
      if (
        existing.status === table.status &&
        existing.number === table.number &&
        existing.capacity === table.capacity &&
        existing.currentOrderId === table.currentOrderId &&
        existing.isActive === table.isActive &&
        existing.runningTotal === table.runningTotal &&
        existing.openedAt === table.openedAt
      ) {
        return;
      }
    }

    let updated: Table[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = table;
    } else {
      updated = [...current, table];
    }

    get().setTablesForFloor(fid, updated.sort((a, b) => a.number - b.number));
  },

  createTable: async (payload) => {
    const created = await tablesService.create(payload);
    const floorId = created.floorId;
    const current = get().items[floorId] || [];
    get().setTablesForFloor(floorId, [...current, created].sort((a, b) => a.number - b.number));
    return created;
  },

  updateTable: async (id, payload) => {
    const updated = await tablesService.update(id, payload);
    const floorId = updated.floorId;
    const current = get().items[floorId] || [];
    get().setTablesForFloor(
      floorId,
      current.map((t) => (t.id === id ? updated : t)).sort((a, b) => a.number - b.number)
    );
    return updated;
  },

  deleteTable: async (id, floorId) => {
    const res = await tablesService.remove(id);
    const current = get().items[floorId] || [];
    if (res.softDeleted) {
      // Mark as inactive in local state
      get().setTablesForFloor(
        floorId,
        current.map((t) => (t.id === id ? { ...t, isActive: false } : t))
      );
    } else {
      get().setTablesForFloor(
        floorId,
        current.filter((t) => t.id !== id)
      );
    }
    return res;
  },

  bulkCreateTables: async (floorId, payload) => {
    const res = await tablesService.bulkCreate(floorId, payload);
    const current = get().items[floorId] || [];
    get().setTablesForFloor(
      floorId,
      [...current, ...res.created].sort((a, b) => a.number - b.number)
    );
    return res;
  },

  tablesForFloor: (floorId: string) => {
    return get().items[floorId] || [];
  },

  counts: (floorId: string) => {
    const tables = get().items[floorId] || [];
    const total = tables.length;
    let free = 0;
    let occupied = 0;

    for (const t of tables) {
      if (t.status === "occupied") {
        occupied++;
      } else {
        free++;
      }
    }

    return { total, free, occupied };
  },
}));
