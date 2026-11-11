import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { User } from "@/types";

export const usersService = {
  async list(): Promise<User[]> {
    const { data } = await apiClient.get<User[]>(ENDPOINTS.users.list);
    return data;
  },

  async getById(id: string): Promise<User> {
    const { data } = await apiClient.get<User>(ENDPOINTS.users.byId(id));
    return data;
  },

  async create(
    user: Omit<User, "id"> & { password: string }
  ): Promise<User> {
    const { data } = await apiClient.post<User>(ENDPOINTS.users.create, user);
    return data;
  },

  async update(
    id: string,
    user: Partial<Omit<User, "id">>
  ): Promise<User> {
    const { data } = await apiClient.put<User>(
      ENDPOINTS.users.update(id),
      user
    );
    return data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.users.delete(id));
  },
};
