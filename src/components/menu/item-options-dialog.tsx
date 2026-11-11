"use client";

import * as React from "react";
import Image from "next/image";
import { X, Utensils, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatMoney } from "@/utils/money";
import type { MenuItem } from "@/types";

export interface ItemOptionsDialogProps {
  open: boolean;
  item: MenuItem | null;
  initialQty?: number;
  initialNote?: string;
  onClose: () => void;
  onConfirm: (qty: number, note: string) => void;
}

const PRESET_NOTES = [
  "Less spicy",
  "Extra spicy",
  "No onion",
  "No garlic",
  "Sauce on side",
  "Well done",
  "Less salt",
  "Urgent / Rush",
];

export function ItemOptionsDialog({
  open,
  item,
  initialQty = 1,
  initialNote = "",
  onClose,
  onConfirm,
}: ItemOptionsDialogProps) {
  const [qty, setQty] = React.useState(initialQty);
  const [note, setNote] = React.useState(initialNote);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setQty(initialQty > 0 ? initialQty : 1);
      setNote(initialNote || "");
      setImgError(false);
    }
  }, [open, initialQty, initialNote]);

  if (!open || !item) return null;

  const handleTogglePreset = (preset: string) => {
    const trimmed = note.trim();
    if (!trimmed) {
      setNote(preset);
      return;
    }
    // If preset already included, remove it
    if (trimmed.includes(preset)) {
      const updated = trimmed
        .replace(preset, "")
        .replace(/,\s*,/g, ",")
        .replace(/^,\s*/, "")
        .replace(/,\s*$/, "")
        .trim();
      setNote(updated);
    } else {
      setNote(`${trimmed}, ${preset}`);
    }
  };

  const handleConfirm = () => {
    onConfirm(qty, note.trim());
    onClose();
  };

  const lineTotal = item.price * qty;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex flex-col bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden border border-border select-none">
        {/* Header */}
        <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between">
          <h3 className="font-extrabold text-lg text-gray-900">
            Customize Item
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-gray-200"
          >
            <X className="h-5 w-5 text-gray-500" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Dish presentation */}
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden shrink-0 border border-border flex items-center justify-center">
              {item.image && !imgError ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover"
                  onError={() => setImgError(true)}
                  unoptimized
                />
              ) : (
                <Utensils className="h-8 w-8 text-gray-400 opacity-50" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-extrabold text-xl text-gray-900 leading-tight">
                {item.name}
              </h4>
              <p className="text-sm font-bold text-primary tabular-nums mt-0.5">
                {formatMoney(item.price)} each
              </p>
              {item.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {item.description}
                </p>
              )}
            </div>
          </div>

          {/* Quantity selector */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-border flex items-center justify-between">
            <div>
              <span className="font-extrabold text-sm text-gray-900">Quantity</span>
              <p className="text-xs text-muted-foreground">Number of servings</p>
            </div>
            <QuantityStepper
              value={qty}
              min={1}
              max={99}
              onChange={setQty}
            />
          </div>

          {/* Special kitchen instructions */}
          <div className="space-y-3">
            <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-600">
              Kitchen Notes / Instructions
            </label>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_NOTES.map((preset) => {
                const isSelected = note.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleTogglePreset(preset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                      isSelected
                        ? "bg-indigo-50 border-primary text-primary font-bold shadow-xs"
                        : "bg-white border-border text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            {/* Custom note textarea */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="E.g. Extra spicy, serve appetizers first, allergen alert..."
              rows={3}
              maxLength={150}
              className="w-full rounded-2xl border-2 border-border p-3 text-sm focus:border-primary focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-white flex items-center justify-between gap-3">
          <div>
            <span className="text-xs text-muted-foreground block font-medium">
              Item Total
            </span>
            <span className="text-2xl font-black text-primary tabular-nums">
              {formatMoney(lineTotal)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="font-bold">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              className="font-bold gap-1.5 shadow-md"
            >
              <Check className="h-4 w-4" />
              <span>Confirm</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
