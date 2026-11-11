"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

/**
 * Tablet-friendly confirm dialog with large tap targets.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-2xl p-6 bg-white border-2 border-border select-none">
        <AlertDialogHeader className="space-y-2 text-left">
          <AlertDialogTitle className="text-xl font-extrabold text-gray-900 tracking-tight">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-6 flex items-center justify-end gap-3 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={handleCancel}
            disabled={loading}
            className="w-full sm:w-auto font-semibold"
          >
            {cancelLabel}
          </Button>

          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "primary"}
            size="md"
            onClick={handleConfirm}
            loading={loading}
            className="w-full sm:w-auto font-bold shadow-sm"
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

