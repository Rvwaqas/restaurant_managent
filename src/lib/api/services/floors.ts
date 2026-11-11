import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { Floor } from "@/types";

export const floorsService = {
  async list(): Promise<Floor[]> {
    const { data } = await apiClient.get<Floor[]>(ENDPOINTS.floors.list);
    return data;
  },

  async getBySlug(slug: string): Promise<Floor> {
    const { data } = await apiClient.get<Floor>(ENDPOINTS.floors.bySlug(slug));
    return data;
  },

  async getById(id: string): Promise<Floor> {
    const { data } = await apiClient.get<Floor>(ENDPOINTS.floors.bySlug(id));
    return data;
  },
};
