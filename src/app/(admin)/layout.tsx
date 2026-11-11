"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UtensilsCrossed,
  SlidersHorizontal,
  Table as TableIcon,
  Printer,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Layers,
  FlaskConical,
  Palette,
} from "lucide-react";
import { APP_NAME } from "@/config/app";
import { useUiStore, useAuthStore } from "@/store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RoleGuard } from "@/components/auth/role-guard";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin/menu", label: "Menu Management", icon: SlidersHorizontal },
  { href: "/admin/tables", label: "Tables Admin", icon: TableIcon },
  { href: "/admin/printers", label: "Printers Admin", icon: Printer },
  { href: "/admin/reports", label: "Sales & Reports", icon: BarChart3 },
];

const QUICK_LINKS = [
  { href: "/floor-1", label: "Floor 1 (Halal)", icon: Layers },
  { href: "/floor-2", label: "Floor 2 (Non-Halal)", icon: Layers },
  { href: "/dev/ui", label: "UI Design Showcase", icon: Palette },
  { href: "/dev/api-check", label: "API Diagnostics", icon: FlaskConical },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { user, logout } = useAuthStore();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <RoleGuard roles={["admin"]}>
      <div className="min-h-screen flex bg-background select-none safe-top safe-bottom">
        {/* 240px Collapsible Sidebar */}
        <aside
          className={cn(
            "bg-white border-r border-border h-screen flex flex-col transition-all duration-200 z-30 shrink-0",
            sidebarCollapsed ? "w-20" : "w-64"
          )}
        >
          {/* Brand Banner */}
          <div className="h-16 border-b border-border flex items-center justify-between px-4">
            <Link href="/admin/menu" className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shrink-0">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              {!sidebarCollapsed && (
                <div className="truncate">
                  <h2 className="font-extrabold text-base tracking-tight text-gray-900 leading-none truncate">
                    {APP_NAME}
                  </h2>
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                    Admin Panel
                  </span>
                </div>
              )}
            </Link>

            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors hidden lg:block"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-6">
            {/* Main Admin Section */}
            <div className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-3 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">
                  Management
                </div>
              )}
              {ADMIN_NAV.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-[0.98]",
                      isActive
                        ? "bg-primary text-white shadow-sm ring-1 ring-primary"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                      sidebarCollapsed && "justify-center px-2"
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>

            {/* Quick Waiter / Dev Section */}
            <div className="space-y-1 pt-2 border-t border-border">
              {!sidebarCollapsed && (
                <div className="px-3 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">
                  Waiter & Dev
                </div>
              )}
              {QUICK_LINKS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150",
                      isActive
                        ? "bg-indigo-50 text-primary font-bold"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                      sidebarCollapsed && "justify-center px-2"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0 text-gray-500" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sidebar Footer: User info & logout */}
          <div className="p-3 border-t border-border bg-gray-50/70">
            {!sidebarCollapsed ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-gray-900 truncate">
                    {user?.name || "Administrator"}
                  </div>
                  <div className="inline-flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-50 text-primary border border-indigo-100">
                      {user?.role || "Admin"}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-destructive"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="h-10 w-10 p-0 rounded-lg text-gray-500 hover:text-destructive"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* Admin Content Area */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Top Header */}
          <header className="h-16 bg-white border-b border-border px-6 flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-4">
              <h2 className="font-extrabold text-lg text-gray-900 capitalize">
                {pathname.replace("/admin/", "").replace("-", " ") || "Dashboard"}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/floor-1">
                <Button variant="outline" size="sm" className="h-10 text-xs font-bold rounded-xl">
                  Open Waiter Floor 1
                </Button>
              </Link>
            </div>
          </header>

          {/* Scrollable View */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
            {children}
          </main>
        </div>

        {/* Logout Confirmation Dialog */}
        <ConfirmDialog
          open={logoutConfirmOpen}
          onOpenChange={setLogoutConfirmOpen}
          title="Sign Out of Admin?"
          description="Are you sure you want to end your administrative session?"
          confirmLabel="Log Out"
          variant="danger"
          onConfirm={handleLogout}
        />
      </div>
    </RoleGuard>
  );
}
