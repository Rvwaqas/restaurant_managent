"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useReportsStore } from "@/store";
import { StatCard } from "@/components/reports/stat-card";
import { formatMoney } from "@/utils/money";
import { Button } from "@/components/ui/button";
import { exportToCsv, buildCsvFilename } from "@/lib/export/csv";
import {
  DollarSign,
  Receipt,
  ShoppingCart,
  Percent,
  TrendingUp,
  ArrowRight,
  Download,
  Utensils,
  CreditCard,
  Building2,
} from "lucide-react";

// Lazy-loaded charts with ssr: false
const SalesChart = dynamic(() => import("@/components/reports/sales-chart"), {
  ssr: false,
  loading: () => <div className="h-80 bg-gray-50/50 rounded-2xl animate-pulse" />,
});

const CategoryDonut = dynamic(() => import("@/components/reports/category-donut"), {
  ssr: false,
  loading: () => <div className="h-64 bg-gray-50/50 rounded-2xl animate-pulse" />,
});

export default function ReportsOverviewPage() {
  const {
    filters,
    summary,
    summaryStatus,
    salesOverTime,
    salesOverTimeStatus,
    byCategory,
    byCategoryStatus,
    byFloor,
    byPaymentMethod,
    topItems,
    fetchOverview,
  } = useReportsStore();

  useEffect(() => {
    fetchOverview();
  }, [filters, fetchOverview]);

  const isLoading = summaryStatus === "loading";
  const metrics = summary || {
    grossSales: 0,
    discounts: 0,
    netSales: 0,
    tax: 0,
    serviceCharge: 0,
    grandTotal: 0,
    billsCount: 0,
    itemsSold: 0,
    avgBill: 0,
    voidedItemsCount: 0,
    voidedAmount: 0,
  };
  const change = summary?.comparison?.changePercent || {};

  const handleExportCsv = () => {
    if (!summary) return;
    const rows = [
      { Metric: "Grand Total", Value: summary.grandTotal },
      { Metric: "Net Sales", Value: summary.netSales },
      { Metric: "Gross Sales", Value: summary.grossSales },
      { Metric: "Discounts", Value: summary.discounts },
      { Metric: "Tax", Value: summary.tax },
      { Metric: "Service Charge", Value: summary.serviceCharge },
      { Metric: "Bills Count", Value: summary.billsCount },
      { Metric: "Items Sold", Value: summary.itemsSold },
      { Metric: "Average Bill", Value: summary.avgBill },
      { Metric: "Cancelled Items", Value: summary.voidedItemsCount },
      { Metric: "Cancelled Amount", Value: summary.voidedAmount },
    ];
    exportToCsv(rows, buildCsvFilename("overview", filters.from, filters.to));
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Grand Total"
          value={formatMoney(metrics.grandTotal)}
          change={change.grandTotal}
          icon={<DollarSign className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Net Sales"
          value={formatMoney(metrics.netSales)}
          change={change.netSales}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Bills Count"
          value={metrics.billsCount.toLocaleString()}
          change={change.billsCount}
          icon={<Receipt className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Avg Bill"
          value={formatMoney(metrics.avgBill)}
          change={change.avgBill}
          icon={<ShoppingCart className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Dishes Sold"
          value={metrics.itemsSold.toLocaleString()}
          change={change.itemsSold}
          icon={<Utensils className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Discounts"
          value={formatMoney(metrics.discounts)}
          change={change.discounts}
          icon={<Percent className="w-4 h-4" />}
          loading={isLoading}
        />
      </div>

      {/* Main Revenue Trend Chart */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Revenue &amp; Bills Over Time</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aggregated transaction volume for the selected date range
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="min-h-[40px] px-3 rounded-xl text-xs border-border gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
            <Link href="/admin/reports/sales">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[40px] px-3 rounded-xl text-xs text-primary gap-1"
              >
                <span>Full sales details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        <SalesChart
          data={salesOverTime}
          loading={salesOverTimeStatus === "loading"}
          groupBy={salesOverTime.length <= 1 ? "hour" : salesOverTime.length <= 62 ? "day" : "month"}
        />
      </div>

      {/* Middle Grid: Top Dishes, Categories, Floors, Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Dishes */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm text-gray-900">Top Selling Dishes</h3>
            </div>
            <Link href="/admin/reports/items">
              <span className="text-xs text-primary font-semibold hover:underline flex items-center">
                All dishes <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </Link>
          </div>

          {topItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">No dishes sold in this period.</p>
          ) : (
            <div className="space-y-3">
              {topItems.slice(0, 5).map((item, idx) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50/70 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-gray-900">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">{item.categoryName} ({item.floorId.toUpperCase()})</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-900 font-mono tabular-nums">{formatMoney(item.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{item.qty} units</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category Breakdown Donut */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-gray-900">Sales by Category</h3>
            <Link href="/admin/reports/items">
              <span className="text-xs text-primary font-semibold hover:underline flex items-center">
                View categories <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </Link>
          </div>

          <CategoryDonut data={byCategory} loading={byCategoryStatus === "loading"} />
        </div>

        {/* Floor Revenue Split */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm text-gray-900">Floor Comparison</h3>
            </div>
            <Link href="/admin/reports/staff">
              <span className="text-xs text-primary font-semibold hover:underline flex items-center">
                Staff &amp; Floors <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </Link>
          </div>

          <div className="space-y-3">
            {byFloor.map((fl) => (
              <div
                key={fl.floorId}
                className="p-4 rounded-xl border border-border bg-gray-50/50 space-y-2"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-900">{fl.name}</span>
                  <span className="font-mono font-bold text-primary">{formatMoney(fl.grandTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                  <span>{fl.billsCount} paid bills</span>
                  <span>Avg: {formatMoney(fl.avgBill)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Methods Split */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm text-gray-900">Payment Breakdown</h3>
            </div>
            <Link href="/admin/reports/staff">
              <span className="text-xs text-primary font-semibold hover:underline flex items-center">
                Details <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </Link>
          </div>

          <div className="space-y-3">
            {byPaymentMethod.map((pm) => (
              <div
                key={pm.method}
                className="p-3 rounded-xl bg-gray-50/70 space-y-1.5"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="capitalize font-semibold text-gray-800">{pm.method}</span>
                  <span className="font-mono font-bold text-gray-900">{formatMoney(pm.amount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, pm.sharePercent)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground w-12 text-right">
                    {pm.sharePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
