import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuItem } from "@/types";

export interface DraftItem {
  menuItemId: string;
  qty: number;
  note?: string;
}

export interface TableDraft {
  items: DraftItem[];
  updatedAt: string;
  requestId: string;
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "req-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now();
}

export interface CartState {
  // Table draft orders keyed by tableId
  drafts: Record<string, TableDraft>;

  // Actions
  addItem: (tableId: string, menuItemId: string, qty?: number, note?: string) => void;
  setQty: (tableId: string, menuItemId: string, qty: number) => void;
  removeItem: (tableId: string, menuItemId: string) => DraftItem | undefined;
  restoreItem: (tableId: string, item: DraftItem) => void;
  setNote: (tableId: string, menuItemId: string, note?: string) => void;
  clearDraft: (tableId: string) => void;
  regenerateRequestId: (tableId: string) => string;

  // Selectors
  getDraft: (tableId: string) => TableDraft | undefined;
  draftItems: (tableId: string) => DraftItem[];
  draftCount: (tableId: string) => number;
  draftSubtotal: (tableId: string, menuItems: MenuItem[]) => number;
  hasDraft: (tableId: string) => boolean;
  tablesWithDrafts: () => string[];
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      drafts: {},

      addItem: (tableId, menuItemId, qtyToAdd = 1, note) => {
        set((state) => {
          const currentDraft = state.drafts[tableId] || {
            items: [],
            updatedAt: new Date().toISOString(),
            requestId: generateRequestId(),
          };

          const existingIndex = currentDraft.items.findIndex((i) => i.menuItemId === menuItemId);
          let newItems: DraftItem[];

          if (existingIndex >= 0) {
            newItems = currentDraft.items.map((item, idx) =>
              idx === existingIndex
                ? {
                    ...item,
                    qty: item.qty + qtyToAdd,
                    note: note !== undefined ? note : item.note,
                  }
                : item
            );
          } else {
            newItems = [
              ...currentDraft.items,
              { menuItemId, qty: qtyToAdd, note },
            ];
          }

          return {
            drafts: {
              ...state.drafts,
              [tableId]: {
                ...currentDraft,
                items: newItems,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      setQty: (tableId, menuItemId, qty) => {
        set((state) => {
          const currentDraft = state.drafts[tableId];
          if (!currentDraft) return state;

          if (qty <= 0) {
            const remaining = currentDraft.items.filter((i) => i.menuItemId !== menuItemId);
            if (remaining.length === 0) {
              const nextDrafts = { ...state.drafts };
              delete nextDrafts[tableId];
              return { drafts: nextDrafts };
            }
            return {
              drafts: {
                ...state.drafts,
                [tableId]: {
                  ...currentDraft,
                  items: remaining,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          }

          return {
            drafts: {
              ...state.drafts,
              [tableId]: {
                ...currentDraft,
                items: currentDraft.items.map((i) =>
                  i.menuItemId === menuItemId ? { ...i, qty } : i
                ),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      removeItem: (tableId, menuItemId) => {
        const draft = get().drafts[tableId];
        if (!draft) return undefined;
        const target = draft.items.find((i) => i.menuItemId === menuItemId);

        set((state) => {
          const current = state.drafts[tableId];
          if (!current) return state;
          const filtered = current.items.filter((i) => i.menuItemId !== menuItemId);

          if (filtered.length === 0) {
            const nextDrafts = { ...state.drafts };
            delete nextDrafts[tableId];
            return { drafts: nextDrafts };
          }

          return {
            drafts: {
              ...state.drafts,
              [tableId]: {
                ...current,
                items: filtered,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });

        return target;
      },

      restoreItem: (tableId, item) => {
        get().addItem(tableId, item.menuItemId, item.qty, item.note);
      },

      setNote: (tableId, menuItemId, note) => {
        set((state) => {
          const currentDraft = state.drafts[tableId];
          if (!currentDraft) return state;

          return {
            drafts: {
              ...state.drafts,
              [tableId]: {
                ...currentDraft,
                items: currentDraft.items.map((i) =>
                  i.menuItemId === menuItemId ? { ...i, note: note?.trim() || undefined } : i
                ),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      clearDraft: (tableId) => {
        set((state) => {
          const next = { ...state.drafts };
          delete next[tableId];
          return { drafts: next };
        });
      },

      regenerateRequestId: (tableId) => {
        const nextId = generateRequestId();
        set((state) => {
          const current = state.drafts[tableId];
          if (!current) return state;
          return {
            drafts: {
              ...state.drafts,
              [tableId]: {
                ...current,
                requestId: nextId,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        return nextId;
      },

      getDraft: (tableId) => {
        return get().drafts[tableId];
      },

      draftItems: (tableId) => {
        return get().drafts[tableId]?.items || [];
      },

      draftCount: (tableId) => {
        const items = get().drafts[tableId]?.items || [];
        return items.reduce((sum, item) => sum + item.qty, 0);
      },

      draftSubtotal: (tableId, menuItems) => {
        const items = get().drafts[tableId]?.items || [];
        const priceMap = new Map(menuItems.map((m) => [m.id, m.price]));
        return items.reduce((sum, item) => {
          const price = priceMap.get(item.menuItemId) || 0;
          return sum + price * item.qty;
        }, 0);
      },

      hasDraft: (tableId) => {
        return (get().drafts[tableId]?.items?.length || 0) > 0;
      },

      tablesWithDrafts: () => {
        const drafts = get().drafts;
        return Object.keys(drafts).filter((tId) => (drafts[tId]?.items?.length || 0) > 0);
      },
    }),
    {
      name: "pos-cart-drafts",
      partialize: (state) => ({
        drafts: state.drafts,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const now = Date.now();
        const maxAgeMs = 12 * 60 * 60 * 1000; // 12 hours
        const cleaned: Record<string, TableDraft> = {};

        for (const [tableId, draft] of Object.entries(state.drafts || {})) {
          const age = now - new Date(draft.updatedAt).getTime();
          if (age < maxAgeMs && draft.items.length > 0) {
            cleaned[tableId] = draft;
          }
        }

        state.drafts = cleaned;
      },
    }
  )
);
