"use client";

import React, { useEffect } from "react";
import { useReportsStore } from "@/store";
import { formatMoney } from "@/utils/money";
import { Button } from "@/components/ui/button";
import { exportToCsv, buildCsvFilename } from "@/lib/export/csv";
import { Download, Users2, CreditCard, Building2 } from "lucide-react";

export default function ReportsStaffPage() {
  const {
    filters,
    byWaiter,
    byWaiterStatus,
    byPaymentMethod,
    byPaymentMethodStatus,
    byFloor,
    fetchByWaiter,
    fetchByPaymentMethod,
    fetchByFloor,
  } = useReportsStore();

  useEffect(() => {
    fetchByWaiter();
    fetchByPaymentMethod();
    fetchByFloor();
  }, [filters, fetchByWaiter, fetchByPaymentMethod, fetchByFloor]);

  const handleExportStaffCsv = () => {
    if (!byWaiter.length) return;
    const rows = byWaiter.map((w) => ({
      Waiter: w.name,
      "Bills Handled": w.billsCount,
      "Items Sold": w.itemsSold,
      "Grand Total": w.grandTotal,
      "Average Bill": w.avgBill,
      "Revenue Share": `${w.sharePercent.toFixed(1)}%`,
    }));
    exportToCsv(rows, buildCsvFilename("staff-performance", filters.from, filters.to));
  };

  const handleExportPaymentsCsv = () => {
    if (!byPaymentMethod.length) return;
    const rows = byPaymentMethod.map((pm) => ({
      Method: pm.method.toUpperCase(),
      "Bills Count": pm.billsCount,
      "Total Amount": pm.amount,
      "Share %": `${pm.sharePercent.toFixed(1)}%`,
    }));
    exportToCsv(rows, buildCsvFilename("payment-methods", filters.from, filters.to));
  };

  return (
    <div className="space-y-6">
      {/* Staff Productivity Table */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users2 className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Waitstaff Productivity</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bills processed, dishes served, and revenue generated per staff member
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportStaffCsv}
            className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Staff CSV</span>
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-border">
              <tr>
                <th className="py-3 px-4">Waiter Name</th>
                <th className="py-3 px-4 text-right">Bills Completed</th>
                <th className="py-3 px-4 text-right">Dishes Sold</th>
                <th className="py-3 px-4 text-right">Average Bill</th>
                <th className="py-3 px-4 text-right">Total Revenue</th>
                <th className="py-3 px-4 text-right">Revenue Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byWaiter.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No staff records for this range.
                  </td>
                </tr>
              ) : (
                byWaiter.map((w) => (
                  <tr key={w.waiterId} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-gray-900">{w.name}</td>
                    <td className="py-3 px-4 text-right font-medium text-gray-700">{w.billsCount}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{w.itemsSold}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-800">{formatMoney(w.avgBill)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                      {formatMoney(w.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-primary">
                      {w.sharePercent.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid: Payment Method Breakdown & Floor Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-gray-900">Tender &amp; Payment Breakdown</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPaymentsCsv}
              className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>

          <div className="space-y-4">
            {byPaymentMethod.map((pm) => (
              <div key={pm.method} className="p-4 rounded-xl border border-border bg-gray-50/50 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="capitalize font-bold text-gray-900">{pm.method}</span>
                  <span className="font-mono font-bold text-gray-900 text-sm">
                    {formatMoney(pm.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, pm.sharePercent)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-primary font-mono w-14 text-right">
                    {pm.sharePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {pm.billsCount} bills settled with {pm.method}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floor Revenue Comparison */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-gray-900">Floor Comparison</h2>
            </div>
          </div>

          <div className="space-y-4">
            {byFloor.map((fl) => (
              <div key={fl.floorId} className="p-4 rounded-xl border border-border bg-gray-50/50 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-gray-900">{fl.name}</span>
                  <span className="font-mono font-bold text-primary text-base">
                    {formatMoney(fl.grandTotal)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Total Bills:</span>
                    <span className="font-bold text-gray-900">{fl.billsCount} bills</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Average Ticket:</span>
                    <span className="font-mono font-bold text-gray-900">{formatMoney(fl.avgBill)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

