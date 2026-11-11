"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store";
import type { UserRole, FloorSlug, User } from "@/types";
import { isSessionExpired } from "@/lib/auth/session";
import { useToast } from "@/components/ui/use-toast";

export interface UseRequireAuthOptions {
  roles?: UserRole[];
  floorSlug?: string;
  redirectTo?: string;
}

export interface UseRequireAuthResult {
  isAuthorized: boolean;
  isLoading: boolean;
  user: User | null;
}

export function useRequireAuth(
  options: UseRequireAuthOptions = {}
): UseRequireAuthResult {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { token, user, expiresAt, hasHydrated, logout } = useAuthStore();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // 1. Wait until Zustand has finished rehydrating localStorage
    if (!hasHydrated) return;

    // 2. Check token presence & expiration
    if (token && isSessionExpired(expiresAt)) {
      logout();
      router.replace("/login?reason=expired");
      return;
    }

    if (!token || !user) {
      const redirectTarget = options.redirectTo || `/login?redirect=${encodeURIComponent(pathname)}`;
      router.replace(redirectTarget);
      return;
    }

    // 3. Role check (e.g. admin only routes)
    if (options.roles && options.roles.length > 0) {
      if (!options.roles.includes(user.role)) {
        router.replace("/403");
        return;
      }
    }

    // 4. Waiter floor access check (e.g. waiter3 only allowed on floor-1)
    if (options.floorSlug && user.role === "waiter" && user.allowedFloors) {
      const slug = options.floorSlug as FloorSlug;
      if (!user.allowedFloors.includes(slug)) {
        router.replace("/403");
        return;
      }
    }

    setIsAuthorized(true);
  }, [hasHydrated, token, user, expiresAt, pathname, options.roles, options.floorSlug, options.redirectTo, router, logout, toast]);

  const isLoading = !hasHydrated || !isAuthorized;

  return { isAuthorized, isLoading, user };
}

