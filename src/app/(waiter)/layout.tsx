"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { UtensilsCrossed, Shield, LogOut, Settings } from "lucide-react";
import { APP_NAME } from "@/config/app";
import { FloorTabs } from "@/components/layout/floor-tabs";
import { useAuthStore, useUiStore } from "@/store";
import { ConnectionPill } from "@/components/common/connection-banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RoleGuard } from "@/components/auth/role-guard";

export default function WaiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuthStore();
  const { setDeviceSettingsOpen } = useUiStore();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <RoleGuard roles={["admin", "waiter"]}>
      <div className="min-h-screen flex flex-col bg-background select-none safe-top safe-bottom">
        {/* Slim 64px Top Bar (NO sidebar for waiters) */}
        <header className="h-16 bg-white border-b border-border px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 shadow-xs">
          {/* Left: Brand Icon + Title */}
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden shadow-sm shrink-0 ring-2 ring-amber-500/20 bg-white">
              <Image
                src="/logo.jpeg"
                alt={APP_NAME}
                fill
                className="object-cover"
                priority
              />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-none">
                {APP_NAME}
              </h1>
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                Waiter Terminal
              </span>
            </div>
          </div>

          {/* Center: Floor Navigation Tabs */}
          <div className="flex items-center justify-center">
            <FloorTabs />
          </div>

          {/* Right: Connectivity indicator + Settings + User menu */}
          <div className="flex items-center gap-3">
            {/* Dynamic connectivity status pill */}
            <ConnectionPill />

            {/* Tablet Device Settings Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeviceSettingsOpen(true)}
              className="h-10 w-10 p-0 rounded-xl text-gray-600 hover:text-gray-900"
              title="Tablet Device Settings"
              aria-label="Tablet Device Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>

            {/* User profile / Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold text-gray-900 leading-none">
                  {user?.name || "Staff"}
                </div>
                <div className="inline-flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-50 text-primary border border-indigo-100">
                    {user?.role}
                  </span>
                </div>
              </div>

              {user?.role === "admin" && (
                <Link href="/admin/menu">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 text-xs font-bold rounded-xl"
                    title="Switch to Admin Panel"
                  >
                    <Shield className="h-3.5 w-3.5 mr-1 text-primary" />
                    <span>Admin</span>
                  </Button>
                </Link>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogoutConfirmOpen(true)}
                className="h-10 px-2.5 rounded-xl text-gray-500 hover:text-destructive hover:bg-red-50"
                title="End Shift / Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {children}
        </main>

        {/* Logout Confirmation Dialog */}
        <ConfirmDialog
          open={logoutConfirmOpen}
          onOpenChange={setLogoutConfirmOpen}
          title="End Terminal Shift?"
          description="Are you sure you want to log out of this tablet? Any active orders on tables will remain saved on the server."
          confirmLabel="Log Out"
          variant="danger"
          onConfirm={handleLogout}
        />
      </div>
    </RoleGuard>
  );
}
