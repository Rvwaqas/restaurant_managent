import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { FloorMenuResponse } from "@/types";

export const menuService = {
  /**
   * Fetches all categories and items for the specified floor.
   * Categories sorted by sortOrder; unavailable items included with available=false.
   */
  async listByFloor(floorId: string): Promise<FloorMenuResponse> {
    const { data } = await apiClient.get<FloorMenuResponse>(
      ENDPOINTS.menu.byFloor(floorId)
    );
    return data;
  },
};
