"use client";

import React from "react";
import type { DailyClosingReport } from "@/types";
import { formatMoney } from "@/utils/money";
import { APP_NAME } from "@/config/app";

interface ClosingSlipProps {
  report: DailyClosingReport;
}

export function ClosingSlip({ report }: ClosingSlipProps) {
  const generatedAt = new Date().toLocaleString();

  return (
    <div className="bg-white text-black p-6 max-w-sm mx-auto font-mono text-xs border border-gray-300 shadow-sm rounded-lg print:border-none print:shadow-none print:p-0 print:max-w-none">
      {/* Header */}
      <div className="text-center pb-3 border-b border-dashed border-gray-400 space-y-1">
        <h1 className="text-base font-bold tracking-wider uppercase">{APP_NAME}</h1>
        <p className="text-xs font-semibold uppercase">Daily Closing Report (Z-Report)</p>
        <p className="text-[11px] text-gray-700">Date: {report.date}</p>
        <p className="text-[10px] text-gray-500">Printed: {generatedAt}</p>
      </div>

      {/* Timestamps */}
      <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-gray-600">First Bill:</span>
          <span>{report.openedAt ? new Date(report.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Last Bill:</span>
          <span>{report.closedAt ? new Date(report.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}</span>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="py-3 border-b border-dashed border-gray-400 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-600">Gross Sales:</span>
          <span className="tabular-nums">{formatMoney(report.summary.grossSales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Discounts:</span>
          <span className="tabular-nums">-{formatMoney(report.summary.discounts)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Net Sales:</span>
          <span className="tabular-nums">{formatMoney(report.summary.netSales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Tax Collected:</span>
          <span className="tabular-nums">{formatMoney(report.summary.tax)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Service Charge:</span>
          <span className="tabular-nums">{formatMoney(report.summary.serviceCharge)}</span>
        </div>
        <div className="pt-2 border-t border-gray-800 flex justify-between font-bold text-sm">
          <span>GRAND TOTAL:</span>
          <span className="tabular-nums">{formatMoney(report.summary.grandTotal)}</span>
        </div>
      </div>

      {/* Operational Counts */}
      <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Paid Bills:</span>
          <span className="font-semibold">{report.summary.billsCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Dishes Sold:</span>
          <span className="font-semibold">{report.summary.itemsSold}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Average Bill:</span>
          <span className="font-semibold tabular-nums">{formatMoney(report.summary.avgBill)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Cancelled Items:</span>
          <span className="font-semibold">{report.summary.voidedItemsCount} ({formatMoney(report.summary.voidedAmount)})</span>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1.5 text-xs">
        <p className="font-bold uppercase text-[11px] text-gray-700">Payment Breakdown</p>
        {report.byPaymentMethod.map((pm) => (
          <div key={pm.method} className="flex justify-between text-[11px]">
            <span className="capitalize">{pm.method} ({pm.billsCount} bills):</span>
            <span className="tabular-nums font-semibold">{formatMoney(pm.amount)}</span>
          </div>
        ))}
      </div>

      {/* Floors Breakdown */}
      <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1.5 text-xs">
        <p className="font-bold uppercase text-[11px] text-gray-700">Floor Breakdown</p>
        {report.byFloor.map((fl) => (
          <div key={fl.floorId} className="flex justify-between text-[11px]">
            <span>{fl.name}:</span>
            <span className="tabular-nums font-semibold">{formatMoney(fl.grandTotal)}</span>
          </div>
        ))}
      </div>

      {/* Top 5 Items */}
      {report.topItems.length > 0 && (
        <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1 text-xs">
          <p className="font-bold uppercase text-[11px] text-gray-700">Top Sellers</p>
          {report.topItems.slice(0, 5).map((item, idx) => (
            <div key={item.menuItemId} className="flex justify-between text-[11px]">
              <span className="truncate pr-2">
                {idx + 1}. {item.name} (x{item.qty})
              </span>
              <span className="tabular-nums font-medium">{formatMoney(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Open Tables Warning */}
      {report.openTablesCount > 0 && (
        <div className="my-3 p-2 bg-amber-50 border border-amber-300 text-amber-900 rounded text-[11px] text-center">
          ⚠ WARNING: {report.openTablesCount} tables remain OPEN and are excluded from this report.
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 text-center text-[10px] text-gray-500">
        <p>End of Daily Closing</p>
        <p>Keep this slip for cash drawer reconciliation</p>
      </div>
    </div>
  );
}
export default ClosingSlip;

