"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Loader2 } from "lucide-react";

export interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName?: string;
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
  isSoftDeleteWarning?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  confirmLabel = "Delete",
  isSoftDeleteWarning = false,
}: ConfirmDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Failed to delete item.");
      setErrorMessage(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!isDeleting) {
      setErrorMessage(null);
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {title}
              </DialogTitle>
              {itemName && (
                <div className="text-sm font-semibold text-gray-800 mt-0.5">
                  &ldquo;{itemName}&rdquo;
                </div>
              )}
            </div>
          </div>
          <DialogDescription className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        {isSoftDeleteWarning && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              If this item has order history, it will be deactivated (soft-deleted) rather than permanently removed, preserving existing sales and reports.
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <DialogFooter className="mt-4 flex flex-row gap-2.5 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isDeleting}
            className="h-12 px-5 rounded-xl font-medium"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="h-12 px-6 rounded-xl font-semibold bg-red-600 hover:bg-red-700 text-white min-w-[100px]"
          >
            {isDeleting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

