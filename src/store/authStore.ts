import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import { authService } from "@/lib/api/services";
import {
  setSessionCookies,
  clearSessionCookies,
  isSessionExpired,
} from "@/lib/auth/session";

export interface AuthState {
  token: string | null;
  user: User | null;
  expiresAt: string | null;
  hasHydrated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionExpired: boolean;

  // Actions
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<User | null>;
  clearError: () => void;
  setHasHydrated: (hydrated: boolean) => void;
  setSessionExpired: (expired: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      expiresAt: null,
      hasHydrated: false,
      isLoading: false,
      error: null,
      sessionExpired: false,

      setHasHydrated: (hydrated: boolean) => {
        set({ hasHydrated: hydrated });
      },

      setSessionExpired: (expired: boolean) => {
        set({ sessionExpired: expired });
      },

      login: async (username: string, password: string): Promise<User> => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login({ username, password });
          const { token, user, expiresAt } = response;

          // Mirror session into cookies for Next.js Middleware route guards
          setSessionCookies(token, user.role, expiresAt);

          set({
            token,
            user,
            expiresAt,
            isLoading: false,
            error: null,
          });

          return user;
        } catch (err: unknown) {
          const apiErr = err as { message?: string };
          const message = apiErr?.message || "Invalid username or password";
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await authService.logout().catch(() => {});
        } finally {
          clearSessionCookies();
          set({
            token: null,
            user: null,
            expiresAt: null,
            error: null,
            isLoading: false,
          });

          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        }
      },

      restoreSession: async (): Promise<User | null> => {
        const { token, expiresAt, user } = get();

        // If no token or expired, reset
        if (!token || isSessionExpired(expiresAt)) {
          clearSessionCookies();
          set({ token: null, user: null, expiresAt: null });
          return null;
        }

        try {
          // Validate token with server /auth/me
          const verifiedUser = await authService.me();
          set({ user: verifiedUser });
          // Ensure cookies are in sync
          setSessionCookies(token, verifiedUser.role, expiresAt);
          return verifiedUser;
        } catch {
          clearSessionCookies();
          set({ token: null, user: null, expiresAt: null });
          return null;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);

        // Check expiry upon hydration
        if (state && state.expiresAt && isSessionExpired(state.expiresAt)) {
          clearSessionCookies();
          setTimeout(() => {
            useAuthStore.setState({
              token: null,
              user: null,
              expiresAt: null,
              sessionExpired: true,
            });
          }, 0);
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            window.location.href = "/login?reason=expired";
          }
        }
      },
    }
  )
);
