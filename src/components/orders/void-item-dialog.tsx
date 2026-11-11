"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Ban } from "lucide-react";

export interface VoidItemDialogProps {
  open: boolean;
  itemName?: string;
  onClose: () => void;
  onConfirmVoid: (reason: string) => Promise<void>;
}

const PRESET_REASONS = [
  "Customer changed mind",
  "Wrong item ordered",
  "Kitchen out of ingredients",
  "Long wait time",
  "Other (specify below)",
];

export function VoidItemDialog({
  open,
  itemName = "Item",
  onClose,
  onConfirmVoid,
}: VoidItemDialogProps) {
  const [selectedReason, setSelectedReason] = React.useState(PRESET_REASONS[0]);
  const [customText, setCustomText] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSelectedReason(PRESET_REASONS[0]);
      setCustomText("");
      setIsSubmitting(false);
    }
  }, [open]);

  const effectiveReason =
    selectedReason === "Other (specify below)"
      ? customText.trim()
      : selectedReason;

  const canConfirm = Boolean(effectiveReason.trim());

  const handleConfirm = async () => {
    if (!canConfirm || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onConfirmVoid(effectiveReason);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(val) => !val && onClose()}>
      <AlertDialogContent className="max-w-md rounded-3xl p-6 bg-white border-2 border-border select-none">
        <AlertDialogHeader className="space-y-3 text-left">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>

          <AlertDialogTitle className="text-xl font-extrabold text-gray-900 tracking-tight">
            Cancel Sent Item: {itemName}
          </AlertDialogTitle>

          <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
            Cancelling this item will remove it from the bill total and dispatch a
            cancellation ticket to the kitchen station printer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-600">
            Select Cancellation Reason
          </label>

          <div className="space-y-1.5">
            {PRESET_REASONS.map((reason) => {
              const isSelected = selectedReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedReason(reason)}
                  className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold transition-all border ${
                    isSelected
                      ? "border-primary bg-indigo-50/70 text-primary font-bold shadow-2xs ring-1 ring-primary/30"
                      : "border-border bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {reason}
                </button>
              );
            })}
          </div>

          {selectedReason === "Other (specify below)" && (
            <textarea
              rows={2}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Enter cancellation reason..."
              maxLength={100}
              className="w-full p-2.5 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="font-bold"
          >
            Back
          </Button>

          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
            loading={isSubmitting}
            className="font-bold bg-amber-600 hover:bg-amber-700 text-white border-none gap-1.5 shadow-sm"
          >
            <Ban className="w-4 h-4" />
            <span>Confirm Cancellation</span>
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

