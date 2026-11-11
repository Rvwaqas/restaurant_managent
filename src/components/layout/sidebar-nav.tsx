"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  TableIcon as TableBar,
  Calculator,
  Settings,
  UtensilsCrossed,
  SlidersHorizontal,
  Printer,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Receipt,
  LayoutDashboard,
} from "lucide-react";
import { APP_NAME } from "@/config/app";
import { useUiStore } from "@/store";
import { useState } from "react";

export function SidebarNav() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUiStore();
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith("/admin"));

  const navItems = [
    { icon: TableBar, label: "Floor 1 (Arabic)", href: "/floor-1" },
    { icon: TableBar, label: "Floor 2 (Malaysian)", href: "/floor-2" },
    { icon: FlaskConical, label: "API Check (/dev)", href: "/dev/api-check" },
  ];

  const adminItems = [
    { icon: LayoutDashboard, label: "Overview", href: "/admin" },
    { icon: Receipt, label: "Paid Bills", href: "/admin/bills" },
    { icon: SlidersHorizontal, label: "Menu Management", href: "/admin/menu" },
    { icon: TableBar, label: "Tables Admin", href: "/admin/tables" },
    { icon: Printer, label: "Printers Admin", href: "/admin/printers" },
    { icon: Calculator, label: "Reports", href: "/admin/reports" },
  ];

  return (
    <div
      className={`${
        sidebarCollapsed ? "w-16" : "w-64"
      } p-4 border-r h-screen transition-all duration-300 bg-white flex flex-col select-none`}
    >
      {!sidebarCollapsed && (
        <div className="flex items-center gap-3 mb-8">
          <div className="relative w-11 h-11 rounded-full overflow-hidden shadow-sm shrink-0 ring-2 ring-amber-500/20 bg-white">
            <Image
              src="/logo.jpeg"
              alt={APP_NAME}
              fill
              className="object-cover"
            />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-gray-900 truncate">
            {APP_NAME}
          </span>
        </div>
      )}

      <nav className="space-y-2 flex-1 overflow-y-auto">
        <div className="text-xs font-semibold uppercase text-gray-400 px-3 mb-2">
          {!sidebarCollapsed && "Waiter Floors"}
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full transition-all duration-200 flex items-center ${
                sidebarCollapsed ? "justify-center px-2 py-2.5" : "justify-start px-4 py-2.5"
              } ${
                isActive
                  ? "bg-gradient-to-r from-green-400 to-green-600 text-white rounded-xl shadow-md scale-[1.02]"
                  : "hover:bg-green-50 text-gray-700 rounded-xl"
              } text-sm font-medium`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon
                className={`h-5 w-5 ${sidebarCollapsed ? "" : "mr-2"} ${
                  isActive ? "text-white" : "text-green-600"
                }`}
              />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Admin section */}
        <div className="pt-4">
          <div className="text-xs font-semibold uppercase text-gray-400 px-3 mb-2">
            {!sidebarCollapsed && "Administration"}
          </div>
          {!sidebarCollapsed ? (
            <div>
              <button
                type="button"
                onClick={() => setAdminOpen(!adminOpen)}
                className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100 rounded-xl"
              >
                <div className="flex items-center">
                  <Settings className="h-4 w-4 mr-2 text-gray-500" />
                  <span>Admin Panel</span>
                </div>
                {adminOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {adminOpen && (
                <div className="pl-4 pt-1 space-y-1">
                  {adminItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-medium ${
                          isActive
                            ? "bg-green-600 text-white font-bold"
                            : "hover:bg-green-50 text-gray-600"
                        }`}
                      >
                        <item.icon className="h-4 w-4 mr-2" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/admin/menu"
              className="flex justify-center p-2 rounded-xl text-gray-700 hover:bg-gray-100"
              title="Admin"
            >
              <Settings className="h-5 w-5 text-gray-500" />
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
