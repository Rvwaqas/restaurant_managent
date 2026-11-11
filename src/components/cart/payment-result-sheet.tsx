"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, Printer, RotateCw, ArrowLeft, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/money";
import { ordersService } from "@/lib/api/services";
import type { PayResult, PrintJob } from "@/types";

export interface PaymentResultSheetProps {
  open: boolean;
  result: PayResult | null;
  tableNumber: number | string;
  floorSlug: string;
  floorName?: string;
  onClose: () => void;
  onBackToTables: () => void;
  onPreviewBill: () => void;
}

export function PaymentResultSheet({
  open,
  result,
  tableNumber,
  floorSlug,
  floorName,
  onClose,
  onBackToTables,
  onPreviewBill,
}: PaymentResultSheetProps) {
  const [printJob, setPrintJob] = React.useState<PrintJob | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);

  React.useEffect(() => {
    if (result) {
      setPrintJob(result.billPrintJob);
    }
  }, [result]);

  if (!open || !result) return null;

  const handleRetryPrint = async () => {
    setIsRetrying(true);
    try {
      const updatedJob = await ordersService.reprintBill(result.order.id);
      setPrintJob(updatedJob);
    } catch (err) {
      console.error("Failed to reprint bill", err);
    } finally {
      setIsRetrying(false);
    }
  };

  const isPrintFailed = printJob?.status === "failed";
  const order = result.order;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex flex-col bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-border select-none">
        {/* Banner with Success Haptic / Visual Animation */}
        <div className="p-6 bg-emerald-50/80 border-b border-emerald-100 flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md animate-in zoom-in-75 duration-200">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              {floorName || floorSlug.toUpperCase()} &bull; TABLE {tableNumber}
            </span>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Payment Received!
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bill <span className="font-extrabold text-gray-900 font-mono">{order.billNo || "B-0001"}</span> settled. Table is now available (Green).
            </p>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-gray-50 border border-border space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-gray-600 uppercase">Total Paid:</span>
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatMoney(order.total)}
              </span>
            </div>

            <div className="flex justify-between text-xs text-gray-600">
              <span>Payment Method:</span>
              <span className="font-bold text-gray-900 uppercase">
                {order.paymentMethod || "Cash"}
              </span>
            </div>

            {order.paymentMethod === "cash" && typeof order.amountReceived === "number" && (
              <>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Cash Received:</span>
                  <span className="font-bold text-gray-900 tabular-nums">
                    {formatMoney(order.amountReceived)}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-bold text-emerald-800 pt-1 border-t border-gray-200">
                  <span>Change Given:</span>
                  <span className="tabular-nums font-black text-sm">
                    {formatMoney(order.changeDue || 0)}
                  </span>
                </div>
              </>
            )}

            <div className="flex justify-between text-[11px] text-gray-400 pt-1">
              <span>Settled At:</span>
              <span>
                {order.paidAt
                  ? new Date(order.paidAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "Just now"}
              </span>
            </div>
          </div>

          {/* Cashier Printer Slip Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase text-gray-500 tracking-wider">
                Cashier Slip Printer
              </h4>
              <button
                type="button"
                onClick={onPreviewBill}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Preview Bill Receipt</span>
              </button>
            </div>

            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                isPrintFailed
                  ? "bg-amber-50 border-amber-200 text-amber-950"
                  : "bg-gray-50 border-border text-gray-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isPrintFailed
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {isPrintFailed ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Printer className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm leading-tight">
                    {printJob?.printerName || "Cashier Printer"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isPrintFailed
                      ? printJob?.error || "Printer offline or out of paper"
                      : "Receipt slip printed successfully"}
                  </div>
                </div>
              </div>

              <div>
                {isPrintFailed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryPrint}
                    disabled={isRetrying}
                    className="font-bold border-amber-300 text-amber-800 hover:bg-amber-100 gap-1.5"
                  >
                    <RotateCw
                      className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`}
                    />
                    <span>Retry</span>
                  </Button>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-200 text-gray-800">
                    Printed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t border-border grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onPreviewBill}
            className="font-bold text-gray-800 border-2 gap-1.5"
          >
            <Receipt className="w-4 h-4" />
            <span>Preview Bill</span>
          </Button>

          <Button
            variant="primary"
            size="lg"
            onClick={onBackToTables}
            className="font-bold shadow-md gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Tables</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

