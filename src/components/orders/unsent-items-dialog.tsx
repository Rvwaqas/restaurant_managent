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
import { AlertCircle, BookmarkPlus, Trash2 } from "lucide-react";

export interface UnsentItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNumber: number | string;
  itemCount: number;
  onKeepDraft: () => void;
  onDiscardDraft: () => void;
  onStay: () => void;
}

export function UnsentItemsDialog({
  open,
  onOpenChange,
  tableNumber,
  itemCount,
  onKeepDraft,
  onDiscardDraft,
  onStay,
}: UnsentItemsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-3xl p-6 bg-white border-2 border-border select-none">
        <AlertDialogHeader className="space-y-3 text-left">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <AlertDialogTitle className="text-xl font-extrabold text-gray-900 tracking-tight">
            Unsent Items in Cart
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
            You have <strong className="text-gray-900 font-bold">{itemCount} unsent {itemCount === 1 ? "item" : "items"}</strong> for Table #{tableNumber}. Would you like to keep them as a draft or discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            variant="primary"
            size="lg"
            onClick={onKeepDraft}
            className="w-full font-bold justify-center gap-2 shadow-sm"
          >
            <BookmarkPlus className="w-5 h-5" />
            <span>Keep Draft & Leave</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={onDiscardDraft}
            className="w-full font-bold justify-center gap-2 text-destructive border-red-200 hover:bg-red-50 hover:text-destructive"
          >
            <Trash2 className="w-5 h-5 text-destructive" />
            <span>Discard Draft & Leave</span>
          </Button>

          <Button
            variant="ghost"
            size="md"
            onClick={onStay}
            className="w-full font-bold text-gray-600 hover:text-gray-900"
          >
            Stay on Order Screen
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
