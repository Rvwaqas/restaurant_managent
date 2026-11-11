"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { RoleGuard } from "@/components/auth/role-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  UtensilsCrossed,
  Users2,
  AlertCircle,
  FileText,
} from "lucide-react";

const TABS = [
  { href: "/admin/reports", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/reports/sales", label: "Sales & Peak Hours", icon: TrendingUp },
  { href: "/admin/reports/items", label: "Dishes & Categories", icon: UtensilsCrossed },
  { href: "/admin/reports/staff", label: "Staff & Payments", icon: Users2 },
  { href: "/admin/reports/cancellations", label: "Discounts & Voids", icon: AlertCircle },
  { href: "/admin/reports/closing", label: "Daily Closing", icon: FileText },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchStr = searchParams.toString();
  const querySuffix = searchStr ? `?${searchStr}` : "";

  return (
    <RoleGuard roles={["admin"]}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <AdminPageHeader
          title="Restaurant Analytics & Reports"
          description="Track sales revenue, peak operating hours, menu performance, staff productivity, and daily closing."
        />

        {/* Sticky Filter Bar */}
        <Suspense fallback={<div className="h-16 bg-white rounded-2xl animate-pulse" />}>
          <ReportFilterBar />
        </Suspense>

        {/* Tab Navigation */}
        <div className="border-b border-border no-print overflow-x-auto scrollbar-none">
          <nav className="flex space-x-2 min-w-max pb-1">
            {TABS.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.href}
                  href={`${tab.href}${querySuffix}`}
                  className={cn(
                    "min-h-[46px] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all select-none",
                    isActive
                      ? "bg-primary text-white shadow-sm font-bold"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-gray-500")} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Report Content */}
        <div className="min-h-[500px]">{children}</div>
      </div>
    </RoleGuard>
  );
}

