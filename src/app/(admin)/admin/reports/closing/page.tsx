"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useReportsStore } from "@/store";
import { formatMoney } from "@/utils/money";
import { Button } from "@/components/ui/button";
import { ClosingSlip } from "@/components/slips/closing-slip";
import { exportToCsv, buildCsvFilename } from "@/lib/export/csv";
import {
  Printer,
  Download,
  AlertTriangle,
  Calendar,
  Building2,
  Receipt,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
} from "lucide-react";

export default function ReportsDailyClosingPage() {
  const {
    dailyClosing,
    dailyClosingStatus,
    dailyClosingDate,
    dailyClosingFloorId,
    setDailyClosingParams,
    fetchDailyClosing,
  } = useReportsStore();

  const [dateInput, setDateInput] = useState(dailyClosingDate);
  const [floorInput, setFloorInput] = useState(dailyClosingFloorId);

  useEffect(() => {
    fetchDailyClosing();
  }, [dailyClosingDate, dailyClosingFloorId, fetchDailyClosing]);

  const handleApplyParams = () => {
    setDailyClosingParams(dateInput, floorInput);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (!dailyClosing) return;
    const s = dailyClosing.summary;
    const rows = [
      { Section: "Date", Key: "Business Date", Value: dailyClosing.date },
      { Section: "Timestamps", Key: "Opened At", Value: dailyClosing.openedAt || "N/A" },
      { Section: "Timestamps", Key: "Closed At", Value: dailyClosing.closedAt || "N/A" },
      { Section: "Summary", Key: "Grand Total", Value: s.grandTotal },
      { Section: "Summary", Key: "Net Sales", Value: s.netSales },
      { Section: "Summary", Key: "Gross Sales", Value: s.grossSales },
      { Section: "Summary", Key: "Discounts", Value: s.discounts },
      { Section: "Summary", Key: "Tax", Value: s.tax },
      { Section: "Summary", Key: "Bills Count", Value: s.billsCount },
      { Section: "Summary", Key: "Items Sold", Value: s.itemsSold },
      { Section: "Summary", Key: "Average Bill", Value: s.avgBill },
      ...dailyClosing.byPaymentMethod.map((pm) => ({
        Section: "Payment",
        Key: pm.method.toUpperCase(),
        Value: pm.amount,
      })),
      ...dailyClosing.byFloor.map((fl) => ({
        Section: "Floor",
        Key: fl.name,
        Value: fl.grandTotal,
      })),
    ];
    exportToCsv(rows, buildCsvFilename(`daily-closing-${dailyClosing.date}`, dailyClosing.date, dailyClosing.date));
  };

  const isLoading = dailyClosingStatus === "loading";

  return (
    <div className="space-y-6">
      {/* Controls Card */}
      <div className="bg-white rounded-2xl border border-border p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
            <Calendar className="w-4 h-4 text-primary" />
            <span>Closing Date:</span>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 text-xs border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
            <Building2 className="w-4 h-4 text-primary" />
            <span>Floor:</span>
            <select
              value={floorInput}
              onChange={(e) => setFloorInput(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 text-xs border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Floors</option>
              <option value="f1">Floor 1 (Halal)</option>
              <option value="f2">Floor 2 (Non-Halal)</option>
            </select>
          </div>

          <Button
            size="sm"
            onClick={handleApplyParams}
            disabled={isLoading}
            className="min-h-[40px] px-4 rounded-xl text-xs font-semibold"
          >
            {isLoading ? "Loading..." : "Load Z-Report"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!dailyClosing}
            className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            size="sm"
            onClick={handlePrint}
            disabled={!dailyClosing}
            className="min-h-[40px] px-4 rounded-xl text-xs font-semibold gap-1.5 bg-gray-900 text-white hover:bg-black"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Closing Slip</span>
          </Button>
        </div>
      </div>

      {/* Warning if tables remain open */}
      {dailyClosing && dailyClosing.openTablesCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-sm no-print">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-sm text-amber-950">
              {dailyClosing.openTablesCount} Active Table{dailyClosing.openTablesCount > 1 ? "s" : ""} Still Open
            </p>
            <p className="text-amber-800">
              Open orders are NOT counted in sales revenue or daily closing figures. Please ensure waiters settle or void all open tables before closing the register for the day.
            </p>
            <div className="pt-1">
              <Link
                href="/floor-1"
                className="font-bold underline text-amber-950 hover:text-black inline-flex items-center gap-1"
              >
                Inspect floor tables <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Closing Report Visual View */}
      {dailyClosing ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Detailed Cards (Screen view) */}
          <div className="lg:col-span-2 space-y-6 no-print">
            {/* Timestamps & Totals Card */}
            <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Financial Settlement
                  </span>
                  <h2 className="text-xl font-black text-gray-900 mt-1">
                    Daily Closing — {dailyClosing.date}
                  </h2>
                </div>
                <div className="text-right text-xs text-muted-foreground font-mono">
                  <div className="flex items-center gap-1 justify-end">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>First: {dailyClosing.openedAt ? new Date(dailyClosing.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}</span>
                  </div>
                  <div>Last: {dailyClosing.closedAt ? new Date(dailyClosing.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold block">Grand Total</span>
                  <span className="text-base font-black text-gray-900 font-mono">{formatMoney(dailyClosing.summary.grandTotal)}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold block">Net Sales</span>
                  <span className="text-base font-black text-primary font-mono">{formatMoney(dailyClosing.summary.netSales)}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold block">Bills Settled</span>
                  <span className="text-base font-black text-gray-900">{dailyClosing.summary.billsCount}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold block">Average Ticket</span>
                  <span className="text-base font-black text-gray-900 font-mono">{formatMoney(dailyClosing.summary.avgBill)}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-border text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Gross Sales (Dishes subtotal)</span>
                  <span className="font-mono font-medium">{formatMoney(dailyClosing.summary.grossSales)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Discounts Granted</span>
                  <span className="font-mono font-medium text-amber-700">-{formatMoney(dailyClosing.summary.discounts)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Tax (0%)</span>
                  <span className="font-mono font-medium">{formatMoney(dailyClosing.summary.tax)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Service Charge (0%)</span>
                  <span className="font-mono font-medium">{formatMoney(dailyClosing.summary.serviceCharge)}</span>
                </div>
              </div>
            </div>

            {/* Payment & Floor Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-3">
                <h3 className="font-bold text-xs uppercase tracking-wider text-gray-700">Cash Drawer &amp; Tenders</h3>
                <div className="space-y-2">
                  {dailyClosing.byPaymentMethod.map((pm) => (
                    <div key={pm.method} className="flex justify-between items-center text-xs p-2.5 rounded-lg bg-gray-50">
                      <span className="capitalize font-semibold">{pm.method} ({pm.billsCount} bills)</span>
                      <span className="font-mono font-bold text-gray-900">{formatMoney(pm.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-3">
                <h3 className="font-bold text-xs uppercase tracking-wider text-gray-700">Floor Breakdown</h3>
                <div className="space-y-2">
                  {dailyClosing.byFloor.map((fl) => (
                    <div key={fl.floorId} className="flex justify-between items-center text-xs p-2.5 rounded-lg bg-gray-50">
                      <span className="font-semibold">{fl.name}</span>
                      <span className="font-mono font-bold text-primary">{formatMoney(fl.grandTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Thermal Slip Preview & Print Area */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground no-print">
              Thermal Slip Preview (80mm)
            </h3>
            <div id="printable-closing-area">
              <ClosingSlip report={dailyClosing} />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground shadow-sm">
          Select a date and click Load Z-Report to view daily closing totals.
        </div>
      )}
    </div>
  );
}

