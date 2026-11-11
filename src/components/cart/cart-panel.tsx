import * as React from "react";
import { ShoppingBag, Trash2, Clock, CheckCircle2, Sparkles, Layers, ListFilter } from "lucide-react";
import { CartLine, type CartLineItem } from "./cart-line";
import { formatMoney } from "@/utils/money";
import { cn } from "@/lib/utils";

export interface BatchGroup {
  batchNo: number;
  sentAt?: string;
  items: CartLineItem[];
}

export interface CartPanelProps {
  tableNumber?: number | string;
  floorName?: string;
  // Draft / unsent items
  draftItems: CartLineItem[];
  // Already sent batches from server
  sentBatches?: BatchGroup[];
  // Financial totals
  subtotal: number;
  tax: number;
  serviceCharge?: number;
  discount?: number;
  total: number;
  // Draft subtotal pill
  draftSubtotal?: number;
  // Permissions & callbacks
  isAdmin?: boolean;
  onVoidItem?: (itemId: string) => void;
  onUpdateQty?: (id: string, newQty: number) => void;
  onRemove?: (id: string) => void;
  onAddNote?: (id: string, note: string) => void;
  onClearDraft?: () => void;
  hintAboveActions?: React.ReactNode;
  footerActions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Tablet-optimized Cart Panel.
 * Separates "Already Sent" batches from "New Items" draft.
 * Supports "By Batch" vs "Merged Bill Summary" toggle for checking customer bill.
 * Formats all financial totals with formatMoney.
 */
export function CartPanel({
  tableNumber,
  floorName,
  draftItems = [],
  sentBatches = [],
  subtotal,
  tax,
  serviceCharge = 0,
  discount = 0,
  total,
  draftSubtotal = 0,
  isAdmin = false,
  onVoidItem,
  onUpdateQty,
  onRemove,
  onAddNote,
  onClearDraft,
  hintAboveActions,
  footerActions,
  children,
  className,
}: CartPanelProps) {
  const [viewMode, setViewMode] = React.useState<"batches" | "merged">("batches");

  const totalDraftCount = draftItems.reduce((sum, item) => sum + item.qty, 0);
  const totalSentCount = sentBatches.reduce(
    (sum, batch) => sum + batch.items.reduce((s, it) => s + it.qty, 0),
    0
  );
  const totalItemCount = totalDraftCount + totalSentCount;
  const hasSent = sentBatches.length > 0;
  const hasDraft = draftItems.length > 0;

  // Merged view of sent items across all batches
  const mergedSentItems = React.useMemo(() => {
    const map = new Map<string, CartLineItem>();
    for (const batch of sentBatches) {
      for (const item of batch.items) {
        // Separate voided from active so cancellation is clear
        const key = `${item.name}-${item.voided ? "voided" : "active"}`;
        const existing = map.get(key);
        if (existing) {
          existing.qty += item.qty;
        } else {
          map.set(key, { ...item });
        }
      }
    }
    return Array.from(map.values());
  }, [sentBatches]);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border-l border-border select-none",
        className
      )}
    >
      {/* 1. Header */}
      <div className="bg-white p-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-xl text-gray-900 tracking-tight">
              {tableNumber ? `Table ${tableNumber}` : "Order Cart"}
            </h3>
            {floorName && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-primary border border-indigo-100">
                {floorName}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalItemCount} {totalItemCount === 1 ? "item" : "items"} total
            {hasDraft && hasSent && ` (${totalDraftCount} unsent)`}
          </p>
        </div>

        {hasDraft && onClearDraft && (
          <button
            type="button"
            onClick={onClearDraft}
            className="text-xs text-gray-500 hover:text-destructive flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Draft</span>
          </button>
        )}
      </div>

      {/* 2. Scrollable items list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!hasSent && !hasDraft ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <ShoppingBag className="h-8 w-8 text-gray-400" />
            </div>
            <h4 className="font-bold text-gray-700 text-base">Cart is empty</h4>
            <p className="text-xs text-gray-500 max-w-[200px] mt-1">
              Select dishes from the menu to build the table&apos;s order.
            </p>
          </div>
        ) : (
          <>
            {/* 2A. Already Sent Section */}
            {hasSent && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-gray-500">
                    <CheckCircle2 className="w-3.5 h-3.5 text-gray-500" />
                    <span>Sent to Kitchen</span>
                  </div>

                  {/* Toggle: By Batch vs Merged Summary */}
                  <div className="flex rounded-lg border border-border bg-white p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setViewMode("batches")}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors flex items-center gap-1 ${
                        viewMode === "batches"
                          ? "bg-primary text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>Batches</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("merged")}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors flex items-center gap-1 ${
                        viewMode === "merged"
                          ? "bg-primary text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <ListFilter className="w-3 h-3" />
                      <span>Summary</span>
                    </button>
                  </div>
                </div>

                {viewMode === "batches" ? (
                  /* Batches View */
                  sentBatches.map((batch) => {
                    const formattedTime = batch.sentAt
                      ? new Date(batch.sentAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";

                    return (
                      <div
                        key={batch.batchNo}
                        className="rounded-2xl border border-gray-200 bg-white/70 p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-gray-600 pb-1.5 border-b border-gray-100">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>Batch #{batch.batchNo}</span>
                          </span>
                          {formattedTime && (
                            <span className="text-[11px] text-gray-400 font-medium">
                              {formattedTime}
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {batch.items.map((item) => (
                            <CartLine
                              key={item.id}
                              item={{ ...item, readOnly: true }}
                              canVoid={isAdmin}
                              onVoid={() => onVoidItem?.(item.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  /* Merged Summary View */
                  <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 space-y-2">
                    <div className="text-xs font-bold text-gray-500 pb-1 border-b border-gray-100">
                      Consolidated Bill Summary ({mergedSentItems.length} items)
                    </div>
                    {mergedSentItems.map((item, idx) => (
                      <CartLine
                        key={idx}
                        item={{ ...item, readOnly: true }}
                        canVoid={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2B. New / Draft Items Section */}
            {hasDraft && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-primary">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>New Items (Draft)</span>
                  </div>
                  {draftSubtotal > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-primary border border-indigo-100 tabular-nums">
                      +{formatMoney(draftSubtotal)}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {draftItems.map((item) => (
                    <CartLine
                      key={item.id}
                      item={item}
                      onUpdateQty={(newQty) => onUpdateQty?.(item.id, newQty)}
                      onRemove={() => onRemove?.(item.id)}
                      onAddNote={(note) => onAddNote?.(item.id, note)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 3. Totals Block */}
      <div className="bg-white p-4 border-t border-border shrink-0 space-y-2">
        <div className="flex justify-between text-sm text-gray-600 font-medium">
          <span>Subtotal</span>
          <span className="tabular-nums font-semibold text-gray-900">
            {formatMoney(subtotal)}
          </span>
        </div>

        {serviceCharge > 0 && (
          <div className="flex justify-between text-sm text-gray-600 font-medium">
            <span>Service Charge</span>
            <span className="tabular-nums font-semibold text-gray-900">
              {formatMoney(serviceCharge)}
            </span>
          </div>
        )}

        <div className="flex justify-between text-sm text-gray-600 font-medium">
          <span>Tax</span>
          <span className="tabular-nums font-semibold text-gray-900">
            {formatMoney(tax)}
          </span>
        </div>

        {discount > 0 && (
          <div className="flex justify-between text-sm text-amber-800 font-medium">
            <span>Discount</span>
            <span className="tabular-nums font-semibold">
              -{formatMoney(discount)}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-border flex justify-between items-baseline">
          <div>
            <span className="text-base font-extrabold text-gray-900 block">
              Total
            </span>
            {hasDraft && draftSubtotal > 0 && (
              <span className="text-[11px] text-muted-foreground font-medium">
                Includes new draft items
              </span>
            )}
          </div>
          <span className="text-2xl font-extrabold text-primary tabular-nums">
            {formatMoney(total)}
          </span>
        </div>
      </div>

      {/* 4. Action buttons & optional hint slot */}
      <div className="bg-white p-4 pt-0 shrink-0 space-y-2">
        {hintAboveActions}
        {footerActions || children}
      </div>
    </div>
  );
}
