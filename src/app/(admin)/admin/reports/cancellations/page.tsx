"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useReportsStore } from "@/store";
import { formatMoney } from "@/utils/money";
import { Button } from "@/components/ui/button";
import { exportToCsv, buildCsvFilename } from "@/lib/export/csv";
import {
  Download,
  Percent,
  XCircle,
  ExternalLink,
  Tag,
  AlertTriangle,
} from "lucide-react";
import type { DiscountRow, VoidedItemRow } from "@/types";

export default function ReportsCancellationsPage() {
  const {
    filters,
    discounts,
    discountsStatus,
    voidedItems,
    voidedItemsStatus,
    fetchDiscounts,
    fetchVoidedItems,
  } = useReportsStore();

  const [activeTab, setActiveTab] = useState<"discounts" | "voids">("discounts");

  useEffect(() => {
    fetchDiscounts();
    fetchVoidedItems();
  }, [filters, fetchDiscounts, fetchVoidedItems]);

  const handleExportDiscountsCsv = () => {
    if (!discounts.length) return;
    const rows = discounts.map((d) => ({
      "Bill #": d.billNo,
      "Paid At": d.paidAt,
      Table: d.tableNumber,
      Floor: d.floorName,
      Waiter: d.waiterName,
      "Discount Type": d.discountType,
      "Discount Value": d.discountValue,
      "Discount Amount": d.discountAmount,
    }));
    exportToCsv(rows, buildCsvFilename("discounts-audit", filters.from, filters.to));
  };

  const handleExportVoidsCsv = () => {
    if (!voidedItems.length) return;
    const rows = voidedItems.map((v) => ({
      Timestamp: v.time,
      "Table #": v.tableNumber,
      Floor: v.floorName,
      "Item Name": v.itemName,
      Quantity: v.qty,
      Amount: v.amount,
      Reason: v.reason,
      "Voided By": v.voidedBy,
    }));
    exportToCsv(rows, buildCsvFilename("cancellations-audit", filters.from, filters.to));
  };

  // Group voided items by reason
  const voidReasonCounts: Record<string, { count: number; amount: number }> = {};
  for (const v of voidedItems) {
    if (!voidReasonCounts[v.reason]) {
      voidReasonCounts[v.reason] = { count: 0, amount: 0 };
    }
    voidReasonCounts[v.reason].count += v.qty;
    voidReasonCounts[v.reason].amount += v.amount;
  }

  const totalDiscountAmount = discounts.reduce((sum, d) => sum + d.discountAmount, 0);
  const totalVoidAmount = voidedItems.reduce((sum, v) => sum + v.amount, 0);

  return (
    <div className="space-y-6">
      {/* Top Section Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Discounts Granted
            </span>
            <div className="text-2xl font-black text-gray-900 mt-1 font-mono tabular-nums">
              {formatMoney(totalDiscountAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Across {discounts.length} discounted bills
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Percent className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Voided / Cancelled Dishes
            </span>
            <div className="text-2xl font-black text-amber-900 mt-1 font-mono tabular-nums">
              {formatMoney(totalVoidAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Across {voidedItems.length} void events (excluded from sales)
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Sub-tabs toggle */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("discounts")}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === "discounts"
              ? "bg-primary text-white shadow-sm font-bold"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Discounts Breakdown ({discounts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("voids")}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === "voids"
              ? "bg-primary text-white shadow-sm font-bold"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Cancelled / Voided Items ({voidedItems.length})</span>
        </button>
      </div>

      {/* Discounts Table */}
      {activeTab === "discounts" && (
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Discounts Audit Log</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every bill that received a percentage or fixed amount reduction
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportDiscountsCsv}
              className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-border">
                <tr>
                  <th className="py-3 px-4">Bill #</th>
                  <th className="py-3 px-4">Paid Time</th>
                  <th className="py-3 px-4">Table</th>
                  <th className="py-3 px-4">Floor</th>
                  <th className="py-3 px-4">Waiter</th>
                  <th className="py-3 px-4">Discount Type</th>
                  <th className="py-3 px-4 text-right">Value</th>
                  <th className="py-3 px-4 text-right">Discount Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {discounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No discounts recorded in this period.
                    </td>
                  </tr>
                ) : (
                  discounts.map((d) => (
                    <tr key={`${d.billNo}-${d.orderId}`} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-primary">
                        <Link href="/admin/bills" className="hover:underline inline-flex items-center gap-1">
                          {d.billNo}
                          <ExternalLink className="w-3 h-3 text-gray-400" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(d.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900">Table {d.tableNumber}</td>
                      <td className="py-3 px-4 text-muted-foreground">{d.floorName}</td>
                      <td className="py-3 px-4 text-gray-700">{d.waiterName}</td>
                      <td className="py-3 px-4 capitalize font-medium">{d.discountType}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {d.discountType === "percent" ? `${d.discountValue}%` : formatMoney(d.discountValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                        {formatMoney(d.discountAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Voids Table */}
      {activeTab === "voids" && (
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Cancelled Dishes Audit Log</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dishes voided by waiters mid-order with supervisor reasons
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportVoidsCsv}
              className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>

          {/* Reason chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">Reasons:</span>
            {Object.entries(voidReasonCounts).map(([reason, stats]) => (
              <span
                key={reason}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"
              >
                <span>{reason}:</span>
                <span className="font-bold">{stats.count} items ({formatMoney(stats.amount)})</span>
              </span>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-border">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Table</th>
                  <th className="py-3 px-4">Floor</th>
                  <th className="py-3 px-4">Dish</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Voided By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {voidedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No dishes were cancelled or voided in this period.
                    </td>
                  </tr>
                ) : (
                  voidedItems.map((v, idx) => (
                    <tr key={`${v.orderId}-${idx}`} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(v.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">Table {v.tableNumber}</td>
                      <td className="py-3 px-4 text-muted-foreground">{v.floorName}</td>
                      <td className="py-3 px-4 font-semibold text-gray-900">{v.itemName}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-700">{v.qty}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                        {formatMoney(v.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          {v.reason}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-700">{v.voidedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

