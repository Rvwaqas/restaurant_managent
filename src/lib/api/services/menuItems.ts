import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { MenuItem, DeleteResult, DuplicateItemPayload } from "@/types";

export const menuItemsService = {
  async list(): Promise<MenuItem[]> {
    const { data } = await apiClient.get<MenuItem[]>(ENDPOINTS.menuItems.list);
    return data;
  },

  async listByFloor(floorId: string): Promise<MenuItem[]> {
    const { data } = await apiClient.get<MenuItem[]>(
      ENDPOINTS.menuItems.byFloor(floorId)
    );
    return data;
  },

  async listByCategory(categoryId: string): Promise<MenuItem[]> {
    const { data } = await apiClient.get<MenuItem[]>(
      ENDPOINTS.menuItems.byCategory(categoryId)
    );
    return data;
  },

  async getById(id: string): Promise<MenuItem> {
    const { data } = await apiClient.get<MenuItem>(
      ENDPOINTS.menuItems.byId(id)
    );
    return data;
  },

  async create(item: Omit<MenuItem, "id">): Promise<MenuItem> {
    const { data } = await apiClient.post<MenuItem>(
      ENDPOINTS.menuItems.create,
      item
    );
    return data;
  },

  async update(
    id: string,
    item: Partial<Omit<MenuItem, "id">>
  ): Promise<MenuItem> {
    const { data } = await apiClient.put<MenuItem>(
      ENDPOINTS.menuItems.update(id),
      item
    );
    return data;
  },

  async setAvailability(id: string, available: boolean): Promise<MenuItem> {
    const { data } = await apiClient.patch<MenuItem>(
      ENDPOINTS.menuItems.toggleAvailability(id),
      { available }
    );
    return data;
  },

  async toggleAvailability(id: string): Promise<MenuItem> {
    const item = await this.getById(id);
    return this.setAvailability(id, !item.available);
  },

  async remove(id: string): Promise<DeleteResult> {
    const { data } = await apiClient.delete<DeleteResult>(ENDPOINTS.menuItems.delete(id));
    return data;
  },

  async delete(id: string): Promise<DeleteResult> {
    return this.remove(id);
  },

  async reorder(categoryId: string, orderedIds: string[]): Promise<MenuItem[]> {
    const { data } = await apiClient.post<MenuItem[]>(
      ENDPOINTS.menuItems.reorder,
      { categoryId, orderedIds }
    );
    return data;
  },

  async duplicateToFloor(
    itemId: string,
    targetFloorId: string,
    targetCategoryId: string
  ): Promise<MenuItem> {
    const payload: DuplicateItemPayload = { targetFloorId, targetCategoryId };
    const { data } = await apiClient.post<MenuItem>(
      ENDPOINTS.menuItems.duplicate(itemId),
      payload
    );
    return data;
  },
};
