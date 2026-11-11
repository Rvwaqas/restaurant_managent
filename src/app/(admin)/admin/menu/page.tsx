"use client";

import { RoleGuard } from "@/components/auth/role-guard";
import { MenuManagement } from "@/components/admin/menu/menu-management";

export default function AdminMenuPage() {
  return (
    <RoleGuard roles={["admin"]}>
      <div className="max-w-7xl mx-auto">
        <MenuManagement />
      </div>
    </RoleGuard>
  );
}
