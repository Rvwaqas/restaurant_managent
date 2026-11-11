import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { Printer, TestPrintResult, DeleteResult } from "@/types";

export const printersService = {
  async list(): Promise<Printer[]> {
    const { data } = await apiClient.get<Printer[]>(ENDPOINTS.printers.list);
    return data;
  },

  async getById(id: string): Promise<Printer> {
    const { data } = await apiClient.get<Printer>(
      ENDPOINTS.printers.byId(id)
    );
    return data;
  },

  async create(printer: Omit<Printer, "id">): Promise<Printer> {
    const { data } = await apiClient.post<Printer>(
      ENDPOINTS.printers.create,
      printer
    );
    return data;
  },

  async update(
    id: string,
    printer: Partial<Omit<Printer, "id">>
  ): Promise<Printer> {
    const { data } = await apiClient.put<Printer>(
      ENDPOINTS.printers.update(id),
      printer
    );
    return data;
  },

  async remove(id: string): Promise<DeleteResult> {
    const { data } = await apiClient.delete<DeleteResult>(ENDPOINTS.printers.delete(id));
    return data;
  },

  async delete(id: string): Promise<DeleteResult> {
    return this.remove(id);
  },

  async testPrint(id: string): Promise<TestPrintResult> {
    const { data } = await apiClient.post<TestPrintResult>(
      ENDPOINTS.printers.testPrint(id)
    );
    return data;
  },
};
