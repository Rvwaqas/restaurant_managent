"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useReportsStore } from "@/store";
import { formatMoney } from "@/utils/money";
import { Button } from "@/components/ui/button";
import { exportToCsv, buildCsvFilename } from "@/lib/export/csv";
import { Download, Calendar, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const SalesChart = dynamic(() => import("@/components/reports/sales-chart"), {
  ssr: false,
  loading: () => <div className="h-80 bg-gray-50/50 rounded-2xl animate-pulse" />,
});

const PeakHoursHeatmap = dynamic(() => import("@/components/reports/peak-hours-heatmap"), {
  ssr: false,
  loading: () => <div className="h-64 bg-gray-50/50 rounded-2xl animate-pulse" />,
});

export default function ReportsSalesPage() {
  const {
    filters,
    salesOverTime,
    salesOverTimeStatus,
    salesGroupBy,
    fetchSalesOverTime,
    peakHours,
    peakHoursStatus,
    fetchPeakHours,
  } = useReportsStore();

  const [selectedGroupBy, setSelectedGroupBy] = useState<"hour" | "day" | "month">(salesGroupBy);

  useEffect(() => {
    fetchSalesOverTime(selectedGroupBy);
    fetchPeakHours();
  }, [filters, selectedGroupBy, fetchSalesOverTime, fetchPeakHours]);

  const handleGroupByChange = (gb: "hour" | "day" | "month") => {
    setSelectedGroupBy(gb);
  };

  const handleExportCsv = () => {
    if (!salesOverTime.length) return;
    const rows = salesOverTime.map((b) => ({
      Period: b.bucket,
      "Bills Count": b.billsCount,
      "Net Sales": b.netSales,
      "Grand Total": b.grandTotal,
    }));
    exportToCsv(rows, buildCsvFilename("sales-over-time", filters.from, filters.to));
  };

  // Calculate table column totals
  const totalBills = salesOverTime.reduce((sum, b) => sum + b.billsCount, 0);
  const totalNet = salesOverTime.reduce((sum, b) => sum + b.netSales, 0);
  const totalGrand = salesOverTime.reduce((sum, b) => sum + b.grandTotal, 0);

  return (
    <div className="space-y-6">
      {/* Sales Trend Chart Card */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">Sales Trend Analysis</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visualize revenue volume grouped by hour, day, or calendar month
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Group By selector */}
            <div className="inline-flex bg-gray-100 p-1 rounded-xl">
              {(
                [
                  { id: "hour", label: "By Hour" },
                  { id: "day", label: "By Day" },
                  { id: "month", label: "By Month" },
                ] as const
              ).map((gb) => (
                <button
                  key={gb.id}
                  type="button"
                  onClick={() => handleGroupByChange(gb.id)}
                  className={cn(
                    "min-h-[38px] px-3.5 py-1 text-xs font-semibold rounded-lg transition-all",
                    selectedGroupBy === gb.id
                      ? "bg-white text-gray-900 shadow-sm font-bold"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {gb.label}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        <SalesChart
          data={salesOverTime}
          loading={salesOverTimeStatus === "loading"}
          groupBy={selectedGroupBy}
        />
      </div>

      {/* Peak Operating Hours Heatmap Card */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Peak Operating Hours Heatmap</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Busiest rush periods by day of the week and hour of day
              </p>
            </div>
          </div>
        </div>

        <PeakHoursHeatmap
          data={peakHours}
          loading={peakHoursStatus === "loading"}
        />
      </div>

      {/* Detailed Aggregation Table */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Detailed Period Records</h2>
          <span className="text-xs text-muted-foreground">{salesOverTime.length} rows</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-border">
              <tr>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4 text-right">Bills Count</th>
                <th className="py-3 px-4 text-right">Net Sales</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {salesOverTime.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No data recorded for this range.
                  </td>
                </tr>
              ) : (
                salesOverTime.map((b) => (
                  <tr key={b.bucket} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900 font-mono">{b.bucket}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{b.billsCount}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatMoney(b.netSales)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                      {formatMoney(b.grandTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {salesOverTime.length > 0 && (
              <tfoot className="bg-gray-50 font-bold border-t border-gray-300">
                <tr>
                  <td className="py-3 px-4 text-gray-900">TOTAL</td>
                  <td className="py-3 px-4 text-right text-gray-900">{totalBills}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatMoney(totalNet)}</td>
                  <td className="py-3 px-4 text-right font-mono text-primary text-sm">
                    {formatMoney(totalGrand)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

