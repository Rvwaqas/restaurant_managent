import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { Category, DeleteResult } from "@/types";

export const categoriesService = {
  async list(): Promise<Category[]> {
    const { data } = await apiClient.get<Category[]>(ENDPOINTS.categories.list);
    return data;
  },

  async listByFloor(floorId: string): Promise<Category[]> {
    const { data } = await apiClient.get<Category[]>(
      ENDPOINTS.categories.byFloor(floorId)
    );
    return data;
  },

  async getById(id: string): Promise<Category> {
    const { data } = await apiClient.get<Category>(
      ENDPOINTS.categories.byId(id)
    );
    return data;
  },

  async create(category: Omit<Category, "id">): Promise<Category> {
    const { data } = await apiClient.post<Category>(
      ENDPOINTS.categories.create,
      category
    );
    return data;
  },

  async update(
    id: string,
    category: Partial<Omit<Category, "id">>
  ): Promise<Category> {
    const { data } = await apiClient.put<Category>(
      ENDPOINTS.categories.update(id),
      category
    );
    return data;
  },

  async remove(id: string): Promise<DeleteResult> {
    const { data } = await apiClient.delete<DeleteResult>(ENDPOINTS.categories.delete(id));
    return data;
  },

  async delete(id: string): Promise<DeleteResult> {
    return this.remove(id);
  },

  async reorder(floorId: string, orderedIds: string[]): Promise<Category[]> {
    const { data } = await apiClient.post<Category[]>(
      ENDPOINTS.categories.reorder,
      { floorId, orderedIds }
    );
    return data;
  },
};
