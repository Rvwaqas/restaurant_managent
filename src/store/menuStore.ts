import { create } from "zustand";
import type { Category, MenuItem, DeleteResult } from "@/types";
import { menuService, categoriesService, menuItemsService } from "@/lib/api/services";

export interface FloorMenuCache {
  categories: Category[];
  items: MenuItem[];
  status: "idle" | "loading" | "success" | "error";
  lastFetchedAt: number | null;
  error: string | null;
}

export interface MenuState {
  cache: Record<string, FloorMenuCache>; // keyed by floorId

  // Actions
  fetchFloorMenu: (floorId: string, force?: boolean) => Promise<FloorMenuCache>;
  clearCache: (floorId?: string) => void;

  // Category mutations (Admin)
  createCategory: (category: Omit<Category, "id">) => Promise<Category>;
  updateCategory: (id: string, category: Partial<Omit<Category, "id">>) => Promise<Category>;
  deleteCategory: (id: string, floorId: string) => Promise<DeleteResult>;
  reorderCategories: (floorId: string, orderedIds: string[]) => Promise<Category[]>;

  // MenuItem mutations (Admin)
  createItem: (item: Omit<MenuItem, "id">) => Promise<MenuItem>;
  updateItem: (id: string, item: Partial<Omit<MenuItem, "id">>) => Promise<MenuItem>;
  deleteItem: (id: string, floorId: string) => Promise<DeleteResult>;
  setAvailability: (id: string, floorId: string, available: boolean) => Promise<MenuItem>;
  reorderItems: (floorId: string, categoryId: string, orderedIds: string[]) => Promise<MenuItem[]>;
  duplicateItem: (itemId: string, targetFloorId: string, targetCategoryId: string) => Promise<MenuItem>;

  // Selectors
  getCategories: (floorId: string) => Category[];
  getItems: (floorId: string) => MenuItem[];
  getItemsByCategory: (floorId: string, categoryId: string | null) => MenuItem[];
  getItem: (floorId: string, itemId: string) => MenuItem | undefined;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  cache: {},

  fetchFloorMenu: async (floorId: string, force = false) => {
    const existing = get().cache[floorId];
    // Return cache if fetched within last 5 minutes and not forced
    if (
      existing &&
      existing.status === "success" &&
      !force &&
      existing.lastFetchedAt &&
      Date.now() - existing.lastFetchedAt < 300000
    ) {
      return existing;
    }

    set((state) => ({
      cache: {
        ...state.cache,
        [floorId]: {
          categories: existing?.categories || [],
          items: existing?.items || [],
          status: "loading",
          lastFetchedAt: existing?.lastFetchedAt || null,
          error: null,
        },
      },
    }));

    try {
      const response = await menuService.listByFloor(floorId);
      const updatedCache: FloorMenuCache = {
        categories: response.categories,
        items: response.items,
        status: "success",
        lastFetchedAt: Date.now(),
        error: null,
      };

      set((state) => ({
        cache: {
          ...state.cache,
          [floorId]: updatedCache,
        },
      }));

      return updatedCache;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load floor menu";
      const errorCache: FloorMenuCache = {
        categories: existing?.categories || [],
        items: existing?.items || [],
        status: "error",
        lastFetchedAt: existing?.lastFetchedAt || null,
        error: message,
      };

      set((state) => ({
        cache: {
          ...state.cache,
          [floorId]: errorCache,
        },
      }));

      return errorCache;
    }
  },

  clearCache: (floorId?: string) => {
    if (floorId) {
      set((state) => {
        const next = { ...state.cache };
        delete next[floorId];
        return { cache: next };
      });
    } else {
      set({ cache: {} });
    }
  },

  createCategory: async (category) => {
    const created = await categoriesService.create(category);
    get().clearCache(category.floorId);
    return created;
  },

  updateCategory: async (id, category) => {
    const updated = await categoriesService.update(id, category);
    get().clearCache(updated.floorId);
    return updated;
  },

  deleteCategory: async (id, floorId) => {
    const res = await categoriesService.remove(id);
    get().clearCache(floorId);
    return res;
  },

  reorderCategories: async (floorId, orderedIds) => {
    const updated = await categoriesService.reorder(floorId, orderedIds);
    get().clearCache(floorId);
    return updated;
  },

  createItem: async (item) => {
    const created = await menuItemsService.create(item);
    get().clearCache(item.floorId);
    return created;
  },

  updateItem: async (id, item) => {
    const updated = await menuItemsService.update(id, item);
    get().clearCache(updated.floorId);
    return updated;
  },

  deleteItem: async (id, floorId) => {
    const res = await menuItemsService.remove(id);
    get().clearCache(floorId);
    return res;
  },

  setAvailability: async (id, floorId, available) => {
    const updated = await menuItemsService.setAvailability(id, available);
    get().clearCache(floorId);
    return updated;
  },

  reorderItems: async (floorId, categoryId, orderedIds) => {
    const updated = await menuItemsService.reorder(categoryId, orderedIds);
    get().clearCache(floorId);
    return updated;
  },

  duplicateItem: async (itemId, targetFloorId, targetCategoryId) => {
    const cloned = await menuItemsService.duplicateToFloor(itemId, targetFloorId, targetCategoryId);
    get().clearCache(targetFloorId);
    return cloned;
  },

  getCategories: (floorId: string) => {
    return get().cache[floorId]?.categories || [];
  },

  getItems: (floorId: string) => {
    return get().cache[floorId]?.items || [];
  },

  getItemsByCategory: (floorId: string, categoryId: string | null) => {
    const all = get().cache[floorId]?.items || [];
    if (!categoryId || categoryId === "all") return all;
    return all.filter((item) => item.categoryId === categoryId);
  },

  getItem: (floorId: string, itemId: string) => {
    return get().cache[floorId]?.items?.find((i) => i.id === itemId);
  },
}));
