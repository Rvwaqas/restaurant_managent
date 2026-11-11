import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { LoginRequest, LoginResponse, User } from "@/types";

export const authService = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>(
      ENDPOINTS.auth.login,
      credentials
    );
    return data;
  },

  async me(): Promise<User> {
    const { data } = await apiClient.get<User>(ENDPOINTS.auth.me);
    return data;
  },

  async logout(): Promise<void> {
    await apiClient.post(ENDPOINTS.auth.logout);
  },
};
