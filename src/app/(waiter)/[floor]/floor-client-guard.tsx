"use client";

import * as React from "react";
import { RoleGuard } from "@/components/auth/role-guard";

export interface FloorClientGuardProps {
  floorSlug: string;
  children: React.ReactNode;
}

export function FloorClientGuard({ floorSlug, children }: FloorClientGuardProps) {
  return (
    <RoleGuard floorSlug={floorSlug} roles={["admin", "waiter"]}>
      {children}
    </RoleGuard>
  );
}

