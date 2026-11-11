import { create } from "zustand";
import type { Floor } from "@/types";
import { floorsService } from "@/lib/api/services";

export interface FloorsState {
  floors: Floor[];
  status: "idle" | "loading" | "success" | "error";
  error: string | null;

  fetchFloors: () => Promise<Floor[]>;
  getFloorBySlug: (slug: string) => Floor | undefined;
}

export const useFloorsStore = create<FloorsState>((set, get) => ({
  floors: [],
  status: "idle",
  error: null,

  fetchFloors: async () => {
    // Return cached floors if already fetched
    const current = get().floors;
    if (current.length > 0) return current;

    set({ status: "loading", error: null });
    try {
      const floors = await floorsService.list();
      set({ floors, status: "success", error: null });
      return floors;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load floors";
      set({ status: "error", error: message });
      return [];
    }
  },

  getFloorBySlug: (slug: string) => {
    return get().floors.find((f) => f.slug === slug);
  },
}));

