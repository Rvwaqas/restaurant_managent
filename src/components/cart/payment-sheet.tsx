"use client";

import * as React from "react";
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
  Percent,
  DollarSign,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/money";
import { TAX_RATE, SERVICE_CHARGE_RATE } from "@/config/app";
import type { Order, PaymentMethod, DiscountType, PayRequest } from "@/types";

export interface MergedOrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface PaymentSheetProps {
  open: boolean;
  order: Order;
  tableNumber: number | string;
  floorName?: string;
  isAdmin?: boolean;
  onClose: () => void;
  onConfirmPay: (payload: PayRequest) => Promise<void>;
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "pay-req-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now();
}

/** Generates quick round cash amounts based on the total bill */
function getQuickCashAmounts(total: number): number[] {
  const roundedCeil = Math.ceil(total);
  const amounts = new Set<number>();
  amounts.add(roundedCeil); // Exact

  const roundTargets = [100, 200, 500, 1000, 2000, 5000];
  for (const t of roundTargets) {
    if (t > total) {
      amounts.add(t);
    }
  }

  // Also next multiple of 500 or 1000
  if (total > 500) {
    amounts.add(Math.ceil(total / 500) * 500);
  }
  if (total > 1000) {
    amounts.add(Math.ceil(total / 1000) * 1000);
  }

  return Array.from(amounts)
    .sort((a, b) => a - b)
    .slice(0, 5);
}

export function PaymentSheet({
  open,
  order,
  tableNumber,
  floorName,
  isAdmin = false,
  onClose,
  onConfirmPay,
}: PaymentSheetProps) {
  // Idempotency key generated per sheet session
  const [requestId, setRequestId] = React.useState<string>(generateRequestId());

  // Form states
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [discountType, setDiscountType] = React.useState<DiscountType>("amount");
  const [discountValue, setDiscountValue] = React.useState<string>("");
  const [amountReceivedInput, setAmountReceivedInput] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Filter out voided items & merge same items across batches
  const mergedItems = React.useMemo(() => {
    const active = (order.items || []).filter((i) => !i.voided);
    const map = new Map<string, MergedOrderItem>();

    for (const item of active) {
      const existing = map.get(item.name);
      if (existing) {
        existing.qty += item.qty;
      } else {
        map.set(item.name, {
          name: item.name,
          qty: item.qty,
          price: item.price,
        });
      }
    }
    return Array.from(map.values());
  }, [order.items]);

  // Base subtotal from active items
  const subtotal = React.useMemo(() => {
    return mergedItems.reduce((s, it) => s + it.price * it.qty, 0);
  }, [mergedItems]);

  // Service charge & tax
  const serviceCharge = Math.round(subtotal * SERVICE_CHARGE_RATE * 100) / 100;
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;

  // Discount calculation
  const numericDiscountVal = parseFloat(discountValue) || 0;
  const discountAmount = React.useMemo(() => {
    if (!isAdmin || numericDiscountVal <= 0) return 0;
    if (discountType === "percent") {
      const pct = Math.min(100, Math.max(0, numericDiscountVal));
      return Math.round(((subtotal * pct) / 100) * 100) / 100;
    }
    return Math.min(subtotal, Math.max(0, numericDiscountVal));
  }, [isAdmin, discountType, numericDiscountVal, subtotal]);

  // Final Total
  const grandTotal = Math.max(0, Math.round((subtotal + serviceCharge + tax - discountAmount) * 100) / 100);

  // Cash change due
  const amountReceivedNum = parseFloat(amountReceivedInput) || 0;
  const changeDue = Math.max(0, Math.round((amountReceivedNum - grandTotal) * 100) / 100);
  const isCashSufficient = method !== "cash" || (amountReceivedNum >= grandTotal && amountReceivedInput !== "");

  // Reset form when sheet opens
  React.useEffect(() => {
    if (open) {
      setRequestId(generateRequestId());
      setMethod("cash");
      setDiscountType("amount");
      setDiscountValue("");
      setAmountReceivedInput(grandTotal > 0 ? String(grandTotal) : "");
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [open, grandTotal]);

  if (!open) return null;

  const quickAmounts = getQuickCashAmounts(grandTotal);

  const handleSubmit = async () => {
    if (!isCashSufficient || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: PayRequest = {
        orderId: order.id,
        requestId,
        method,
        discountType: isAdmin && discountAmount > 0 ? discountType : undefined,
        discountValue: isAdmin && discountAmount > 0 ? numericDiscountVal : undefined,
        amountReceived: method === "cash" ? amountReceivedNum : grandTotal,
      };

      await onConfirmPay(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record payment. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex flex-col bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden border border-border select-none">
        {/* Header */}
        <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-xl text-gray-900">
                Pay Table {tableNumber}
              </h3>
              {floorName && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-primary border border-indigo-100">
                  {floorName}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review items and select payment method to settle bill.
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full hover:bg-gray-200"
          >
            <X className="h-5 w-5 text-gray-500" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="block font-black">Payment Error</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Merged Items Summary */}
          <div className="space-y-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
              Bill Items ({mergedItems.reduce((s, it) => s + it.qty, 0)})
            </h4>
            <div className="max-h-36 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50/50 divide-y divide-gray-100 p-2">
              {mergedItems.map((item, idx) => (
                <div
                  key={idx}
                  className="py-1.5 px-2 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-gray-900 tabular-nums">
                      {item.qty}x
                    </span>
                    <span className="font-medium text-gray-800 truncate">
                      {item.name}
                    </span>
                  </div>
                  <span className="font-extrabold text-gray-900 tabular-nums ml-2">
                    {formatMoney(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Discount Section (Admin Only) */}
          {isAdmin && (
            <div className="p-3.5 rounded-2xl border border-border bg-gray-50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">
                  Manager Discount
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-primary uppercase">
                  Admin Only
                </span>
              </div>

              <div className="flex gap-2">
                <div className="flex rounded-xl border border-border bg-white p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDiscountType("amount")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                      discountType === "amount"
                        ? "bg-primary text-white"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Rs
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType("percent")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                      discountType === "percent"
                        ? "bg-primary text-white"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    %
                  </button>
                </div>

                <div className="relative flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={discountType === "percent" ? "100" : String(subtotal)}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === "percent" ? "0 - 100%" : "Discount amount"}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {discountAmount > 0 && (
                    <span className="absolute right-3 top-2.5 text-xs font-extrabold text-emerald-700">
                      -{formatMoney(discountAmount)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Totals Summary */}
          <div className="p-4 rounded-2xl bg-white border border-border shadow-xs space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums font-semibold text-gray-900">
                {formatMoney(subtotal)}
              </span>
            </div>

            {serviceCharge > 0 && (
              <div className="flex justify-between text-xs font-medium text-gray-600">
                <span>Service Charge</span>
                <span className="tabular-nums font-semibold text-gray-900">
                  {formatMoney(serviceCharge)}
                </span>
              </div>
            )}

            {tax > 0 && (
              <div className="flex justify-between text-xs font-medium text-gray-600">
                <span>Tax</span>
                <span className="tabular-nums font-semibold text-gray-900">
                  {formatMoney(tax)}
                </span>
              </div>
            )}

            {discountAmount > 0 && (
              <div className="flex justify-between text-xs font-semibold text-amber-800">
                <span>Discount</span>
                <span className="tabular-nums">-{formatMoney(discountAmount)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-border flex justify-between items-baseline">
              <span className="text-base font-black text-gray-900">Grand Total</span>
              <span className="text-3xl font-black text-primary tabular-nums">
                {formatMoney(grandTotal)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector (3 large tiles) */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-600">
              Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setMethod("cash")}
                className={`min-h-[58px] p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] ${
                  method === "cash"
                    ? "border-primary bg-indigo-50/70 text-primary font-black shadow-xs ring-2 ring-primary/20"
                    : "border-border bg-white text-gray-700 font-bold hover:bg-gray-50"
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span className="text-xs">Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod("card")}
                className={`min-h-[58px] p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] ${
                  method === "card"
                    ? "border-primary bg-indigo-50/70 text-primary font-black shadow-xs ring-2 ring-primary/20"
                    : "border-border bg-white text-gray-700 font-bold hover:bg-gray-50"
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs">Card / POS</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod("online")}
                className={`min-h-[58px] p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] ${
                  method === "online"
                    ? "border-primary bg-indigo-50/70 text-primary font-black shadow-xs ring-2 ring-primary/20"
                    : "border-border bg-white text-gray-700 font-bold hover:bg-gray-50"
                }`}
              >
                <Smartphone className="w-5 h-5" />
                <span className="text-xs">Online / QR</span>
              </button>
            </div>
          </div>

          {/* Cash Amount Received & Quick Chips */}
          {method === "cash" && (
            <div className="p-4 rounded-2xl bg-gray-50 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                  Amount Received
                </label>
                <span className="text-xs font-bold text-gray-500">
                  Due: {formatMoney(grandTotal)}
                </span>
              </div>

              {/* Quick Amount Chips */}
              <div className="flex flex-wrap gap-1.5">
                {quickAmounts.map((amt) => {
                  const isSelected = amountReceivedNum === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmountReceivedInput(String(amt))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                        isSelected
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-white border-border text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {amt === Math.ceil(grandTotal) ? `Exact (${amt})` : `${amt}`}
                    </button>
                  );
                })}
              </div>

              {/* Input & Change Due line */}
              <div className="space-y-2 pt-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={amountReceivedInput}
                  onChange={(e) => setAmountReceivedInput(e.target.value)}
                  placeholder="Enter cash received"
                  className="w-full h-12 px-4 rounded-xl border-2 border-border bg-white text-base font-extrabold tabular-nums focus:outline-none focus:border-primary"
                />

                <div className="flex items-center justify-between text-xs font-bold pt-1">
                  <span className="text-gray-600">Change to return:</span>
                  <span
                    className={`text-sm font-black tabular-nums ${
                      amountReceivedNum < grandTotal && amountReceivedInput !== ""
                        ? "text-amber-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {amountReceivedNum < grandTotal && amountReceivedInput !== ""
                      ? `Insufficient (Short by ${formatMoney(grandTotal - amountReceivedNum)})`
                      : formatMoney(changeDue)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 bg-gray-50 border-t border-border flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={isSubmitting}
            className="font-bold border-2"
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={!isCashSufficient || isSubmitting}
            loading={isSubmitting}
            className="flex-1 font-black text-base shadow-md gap-2"
          >
            <Check className="h-5 w-5" />
            <span>Confirm Payment &bull; {formatMoney(grandTotal)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

