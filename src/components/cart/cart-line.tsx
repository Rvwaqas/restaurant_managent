import * as React from "react";
import { Trash2, MessageSquarePlus, Lock, Ban } from "lucide-react";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatMoney } from "@/utils/money";
import { cn } from "@/lib/utils";

export interface CartLineItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  categoryName?: string;
  readOnly?: boolean;
  batchNo?: number;
  sentAt?: string;
  voided?: boolean;
  voidReason?: string;
}

export interface CartLineProps {
  item: CartLineItem;
  onUpdateQty?: (newQty: number) => void;
  onRemove?: () => void;
  onAddNote?: (note: string) => void;
  onVoid?: () => void;
  canVoid?: boolean;
  className?: string;
}

/**
 * Single item row in the order cart with big touch targets.
 * Supports editable draft items, read-only sent items, and voided/cancelled items.
 */
export function CartLine({
  item,
  onUpdateQty,
  onRemove,
  onAddNote,
  onVoid,
  canVoid = false,
  className,
}: CartLineProps) {
  const [editingNote, setEditingNote] = React.useState(false);
  const [noteText, setNoteText] = React.useState(item.note || "");

  const handleSaveNote = () => {
    if (onAddNote) {
      onAddNote(noteText.trim());
    }
    setEditingNote(false);
  };

  const isReadOnly = Boolean(item.readOnly);
  const isVoided = Boolean(item.voided);

  return (
    <div
      className={cn(
        "p-3.5 bg-white rounded-2xl border shadow-xs flex flex-col gap-2.5 transition-all",
        isVoided
          ? "border-amber-200 bg-amber-50/40 opacity-75"
          : isReadOnly
          ? "border-gray-200 bg-gray-50/60"
          : "border-border",
        className
      )}
    >
      {/* Top row: Title and delete or lock/void icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4
              className={cn(
                "font-bold text-base leading-snug truncate",
                isVoided ? "line-through text-gray-500" : "text-gray-900"
              )}
            >
              {item.name}
            </h4>

            {isVoided ? (
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider shrink-0">
                Cancelled
              </span>
            ) : (
              isReadOnly && (
                <span title="Item already sent to kitchen">
                  <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                </span>
              )
            )}
          </div>

          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              isVoided ? "text-gray-400 line-through" : "text-primary"
            )}
          >
            {formatMoney(item.price)} each
          </span>
        </div>

        {/* Delete button (for draft items) */}
        {!isReadOnly && !isVoided && onRemove && (
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onClick={onRemove}
            className="p-2 -mr-1 -mt-1 rounded-xl text-gray-400 hover:text-destructive hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}

        {/* Admin Void button (for sent items) */}
        {isReadOnly && !isVoided && canVoid && onVoid && (
          <button
            type="button"
            title="Cancel / Void item (Admin only)"
            onClick={onVoid}
            className="px-2 py-1 -mr-1 -mt-1 rounded-lg text-amber-800 hover:bg-amber-100 text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <Ban className="h-3.5 w-3.5" />
            <span>Cancel</span>
          </button>
        )}
      </div>

      {/* Special kitchen note or void reason */}
      {isVoided && item.voidReason && (
        <div className="text-[11px] font-bold text-amber-900 bg-amber-100/60 rounded-xl px-2.5 py-1">
          Reason: {item.voidReason}
        </div>
      )}

      {item.note && !editingNote && !isVoided && (
        <div className="bg-amber-50 text-amber-900 border border-amber-200/70 rounded-xl px-2.5 py-1.5 text-xs font-medium flex items-center justify-between">
          <span>Note: &quot;{item.note}&quot;</span>
          {!isReadOnly && onAddNote && (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="text-amber-700 underline text-[11px] font-bold ml-2"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {/* Inline note edit box */}
      {!isReadOnly && !isVoided && editingNote && (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. less spicy, no onion"
            className="flex-1 h-10 px-3 text-sm rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSaveNote}
            className="h-10 px-3 bg-primary text-white rounded-lg text-xs font-bold"
          >
            Done
          </button>
        </div>
      )}

      {/* Bottom controls: Stepper / Qty display & Line total */}
      <div className="flex items-center justify-between pt-1">
        {!item.note && !editingNote && !isReadOnly && !isVoided && onAddNote ? (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-900 font-medium py-1"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span>Add note</span>
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "font-extrabold text-base tabular-nums",
              isVoided ? "line-through text-gray-400" : "text-gray-900"
            )}
          >
            {isVoided ? "Cancelled" : formatMoney(item.price * item.qty)}
          </span>

          {isReadOnly || isVoided ? (
            <div className="px-3 py-1 bg-gray-200/80 rounded-lg text-xs font-black text-gray-800 tabular-nums">
              Qty: {item.qty}
            </div>
          ) : (
            onUpdateQty && (
              <QuantityStepper
                value={item.qty}
                min={0}
                max={99}
                onChange={onUpdateQty}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
