"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { RoleGuard } from "@/components/auth/role-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTablesStore, usePrintersStore } from "@/store";
import { reportsService } from "@/lib/api/services";
import { formatMoney } from "@/utils/money";
import type { ReportSummary, SalesOverTimeBucket, TopItemRow } from "@/types";
import {
  Receipt,
  SlidersHorizontal,
  TableIcon as TableBar,
  Printer,
  Calculator,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  FileText,
  DollarSign,
  Utensils,
} from "lucide-react";

// Mini Sparkline (client only)
const MiniSparkline = dynamic(
  () =>
    import("recharts").then((mod) => {
      const { ResponsiveContainer, AreaChart, Area } = mod;
      return function SparklineComponent({ data }: { data: SalesOverTimeBucket[] }) {
        if (!data || data.length === 0) return null;
        return (
          <ResponsiveContainer width="100%" height={48}>
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="miniSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="grandTotal"
                stroke="#4F46E5"
                strokeWidth={2}
                fill="url(#miniSpark)"
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      };
    }),
  { ssr: false }
);

export default function AdminDashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [todaySummary, setTodaySummary] = useState<ReportSummary | null>(null);
  const [todayHourly, setTodayHourly] = useState<SalesOverTimeBucket[]>([]);
  const [todayTopItems, setTodayTopItems] = useState<TopItemRow[]>([]);

  const { fetchFloor, tablesForFloor } = useTablesStore();
  const { items: printers, fetchPrinters } = usePrintersStore();

  const loadStats = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [sum, hourly, top] = await Promise.all([
        reportsService.summary({ from: today, to: today }),
        reportsService.salesOverTime({ from: today, to: today }, "hour"),
        reportsService.topItems({ from: today, to: today }, { limit: 3 }),
        fetchFloor("f1"),
        fetchFloor("f2"),
        fetchPrinters(),
      ]);
      setTodaySummary(sum);
      setTodayHourly(hourly);
      setTodayTopItems(top);
    } catch (err) {
      console.error("Failed to load dashboard stats", err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchFloor, fetchPrinters]);

  useEffect(() => {
    loadStats();
    // Auto-refresh every 60s
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const f1Tables = tablesForFloor("f1");
  const f2Tables = tablesForFloor("f2");
  const allTables = [...f1Tables, ...f2Tables];

  const occupiedTables = allTables.filter((t) => t.status === "occupied");
  const freeTables = allTables.filter((t) => t.status === "free" && t.isActive !== false);

  const cashierPrinters = printers.filter((p) => p.role === "cashier" && p.isActive);
  const kitchenPrinters = printers.filter((p) => p.role === "kitchen" && p.isActive);

  const grandTotal = todaySummary ? todaySummary.grandTotal : 0;
  const billsCount = todaySummary ? todaySummary.billsCount : 0;
  const avgBill = todaySummary ? todaySummary.avgBill : 0;

  return (
    <RoleGuard roles={["admin"]}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <AdminPageHeader
          title="Manager Overview"
          description="Real-time restaurant performance, active table occupancy, and administration shortcuts."
          actions={
            <div className="flex items-center gap-2">
              <Link href="/floor-1">
                <Button variant="outline" className="h-11 px-4 rounded-xl border-border bg-white text-xs font-semibold">
                  Open Halal Floor
                  <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
              <Link href="/floor-2">
                <Button variant="outline" className="h-11 px-4 rounded-xl border-border bg-white text-xs font-semibold">
                  Open Non-Halal Floor
                  <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          }
        />

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-border shadow-sm p-5 bg-white flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Today&apos;s Sales
                </span>
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-gray-900 mt-2 font-mono tabular-nums">
                {formatMoney(grandTotal)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {billsCount} bills settled today
              </div>
            </div>

            {/* Sparkline */}
            <div className="mt-3 pt-2 border-t border-border/50">
              <MiniSparkline data={todayHourly} />
            </div>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm p-5 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Occupied Tables
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <TableBar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 mt-2 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
              {occupiedTables.length} Tables
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {freeTables.length} tables currently free
            </div>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm p-5 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Average Ticket
              </span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-gray-900 mt-2 font-mono tabular-nums">
              {formatMoney(avgBill)}
            </div>
            <Link
              href="/admin/reports"
              className="text-xs text-primary font-semibold mt-1 flex items-center hover:underline"
            >
              Detailed sales analytics
              <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm p-5 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Printers Status
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                <Printer className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-gray-900 mt-2">
              {cashierPrinters.length + kitchenPrinters.length} Online
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {cashierPrinters.length > 0 ? (
                <span className="text-primary font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Cashier ready
                </span>
              ) : (
                <span className="text-amber-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  No cashier printer
                </span>
              )}
            </div>
          </Card>
        </div>

        {/* Live Top Dishes & Quick Daily Closing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm text-gray-900">Today&apos;s Top Sellers</h3>
              </div>
              <Link href="/admin/reports/items" className="text-xs text-primary font-semibold hover:underline">
                View all dishes →
              </Link>
            </div>

            {todayTopItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No dishes sold today yet.</p>
            ) : (
              <div className="space-y-2">
                {todayTopItems.map((item, idx) => (
                  <div key={item.menuItemId} className="flex justify-between items-center text-xs p-2 rounded-lg bg-gray-50">
                    <span className="font-medium text-gray-900">
                      {idx + 1}. {item.name} ({item.floorId.toUpperCase()})
                    </span>
                    <span className="font-bold text-gray-900 font-mono">
                      {item.qty} sold ({formatMoney(item.amount)})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-border p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm text-gray-900">End-of-Day Reconciliation</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Generate the official daily Z-report, review cash drawer balances, inspect open tables, and print the closing slip for cashier records.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Auto-updated every 60s
              </span>
              <Link href="/admin/reports/closing">
                <Button size="sm" className="min-h-[40px] px-4 rounded-xl text-xs font-semibold gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Open Daily Closing</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Navigation Shortcut Cards */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-4">
            Management & Operations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Link href="/admin/menu" className="block group">
              <Card className="rounded-2xl border-border shadow-sm p-6 bg-white hover:border-primary hover:shadow-md transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <SlidersHorizontal className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 group-hover:text-primary transition-colors">
                    Menu Management
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Add &amp; reorder food categories, update dish pricing, toggle availability, and assign kitchen printers per floor.
                  </p>
                </div>
                <div className="mt-5 flex items-center text-xs font-bold text-primary gap-1">
                  <span>Manage Menu</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>

            <Link href="/admin/tables" className="block group">
              <Card className="rounded-2xl border-border shadow-sm p-6 bg-white hover:border-primary hover:shadow-md transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <TableBar className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 group-hover:text-primary transition-colors">
                    Table Management
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Configure table numbers, adjust seat capacities, bulk generate table ranges, and monitor live occupancy status.
                  </p>
                </div>
                <div className="mt-5 flex items-center text-xs font-bold text-primary gap-1">
                  <span>Configure Tables</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>

            <Link href="/admin/printers" className="block group">
              <Card className="rounded-2xl border-border shadow-sm p-6 bg-white hover:border-primary hover:shadow-md transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Printer className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 group-hover:text-purple-700 transition-colors">
                    Thermal Printers
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Setup IP/port network thermal printers for kitchen category slips, cashier receipt routing, and test connectivity.
                  </p>
                </div>
                <div className="mt-5 flex items-center text-xs font-bold text-purple-700 gap-1">
                  <span>Manage Printers</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>

            <Link href="/admin/bills" className="block group">
              <Card className="rounded-2xl border-border shadow-sm p-6 bg-white hover:border-primary hover:shadow-md transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-700 transition-colors">
                    Paid Bills Audit
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Review completed transactions, payment method breakdowns (cash/card/online), and reprint customer bill slips.
                  </p>
                </div>
                <div className="mt-5 flex items-center text-xs font-bold text-blue-700 gap-1">
                  <span>Audit Bills</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>

            <Link href="/admin/reports" className="block group">
              <Card className="rounded-2xl border-border shadow-sm p-6 bg-white hover:border-primary hover:shadow-md transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 group-hover:text-primary transition-colors">
                    Sales Reports
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Review revenue trends, category breakdown, top selling dishes, peak hours, and waiter performance metrics.
                  </p>
                </div>
                <div className="mt-5 flex items-center text-xs font-bold text-primary gap-1">
                  <span>View Reports</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
