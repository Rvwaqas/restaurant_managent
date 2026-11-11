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
import { CheckCircle2, ArrowLeft } from "lucide-react";

export interface TableAlreadyPaidDialogProps {
  open: boolean;
  tableNumber: number | string;
  floorSlug: string;
  onBackToTables: () => void;
}

export function TableAlreadyPaidDialog({
  open,
  tableNumber,
  onBackToTables,
}: TableAlreadyPaidDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md rounded-3xl p-6 bg-white border-2 border-border select-none">
        <AlertDialogHeader className="space-y-3 text-left">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>

          <AlertDialogTitle className="text-xl font-extrabold text-gray-900 tracking-tight">
            Table #{tableNumber} Already Paid
          </AlertDialogTitle>

          <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
            This table&apos;s bill was settled and paid on another tablet or at the cashier counter. The order has closed and the table is now available.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-6 pt-3 border-t border-border flex justify-end">
          <Button
            variant="primary"
            size="lg"
            onClick={onBackToTables}
            className="w-full font-bold justify-center gap-2 shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Return to Tables Grid</span>
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

