"use client";

import * as React from "react";
import { useRequireAuth, type UseRequireAuthOptions } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/ui/loading-screen";

export interface RoleGuardProps extends UseRequireAuthOptions {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client-side Route & Role Guard Component.
 * Protects children views, redirects unauthorized users to /login or /403,
 * and renders a flicker-free LoadingScreen until client state hydrates.
 */
export function RoleGuard({
  children,
  roles,
  floorSlug,
  redirectTo,
  fallback,
}: RoleGuardProps) {
  const { isAuthorized, isLoading } = useRequireAuth({
    roles,
    floorSlug,
    redirectTo,
  });

  if (isLoading || !isAuthorized) {
    return fallback ? <>{fallback}</> : <LoadingScreen message="Verifying shift credentials..." />;
  }

  return <>{children}</>;
}

