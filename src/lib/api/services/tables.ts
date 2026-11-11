import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type {
  Table,
  TableStatus,
  DeleteResult,
  BulkCreateTablesPayload,
  BulkCreateTablesResult,
} from "@/types";

export const tablesService = {
  async list(): Promise<Table[]> {
    const { data } = await apiClient.get<Table[]>(ENDPOINTS.tables.list);
    return data;
  },

  async listByFloor(floorId: string): Promise<Table[]> {
    const { data } = await apiClient.get<Table[]>(
      ENDPOINTS.tables.byFloor(floorId)
    );
    return data;
  },

  async getById(id: string): Promise<Table> {
    const { data } = await apiClient.get<Table>(ENDPOINTS.tables.byId(id));
    return data;
  },

  async create(table: Omit<Table, "id">): Promise<Table> {
    const { data } = await apiClient.post<Table>(ENDPOINTS.tables.create, table);
    return data;
  },

  async update(id: string, table: Partial<Omit<Table, "id">>): Promise<Table> {
    const { data } = await apiClient.put<Table>(ENDPOINTS.tables.update(id), table);
    return data;
  },

  async remove(id: string): Promise<DeleteResult> {
    const { data } = await apiClient.delete<DeleteResult>(ENDPOINTS.tables.delete(id));
    return data;
  },

  async delete(id: string): Promise<DeleteResult> {
    return this.remove(id);
  },

  async bulkCreate(
    floorId: string,
    payload: BulkCreateTablesPayload
  ): Promise<BulkCreateTablesResult> {
    const { data } = await apiClient.post<BulkCreateTablesResult>(
      ENDPOINTS.tables.bulkCreate,
      { floorId, ...payload }
    );
    return data;
  },

  async updateStatus(
    id: string,
    status: TableStatus,
    currentOrderId?: string
  ): Promise<Table> {
    const { data } = await apiClient.patch<Table>(
      ENDPOINTS.tables.updateStatus(id),
      { status, currentOrderId }
    );
    return data;
  },
};
