"use client";

import * as React from "react";
import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillSlip, type BillSlipItem } from "./bill-slip";

export interface BillSlipModalProps {
  open: boolean;
  onClose: () => void;
  tableNumber: number | string;
  floorName?: string;
  billNo?: string;
  waiterName?: string;
  timestamp?: string | Date;
  items: BillSlipItem[];
  subtotal: number;
  serviceCharge?: number;
  tax: number;
  discount?: number;
  total: number;
  paymentMethod?: string;
  amountReceived?: number;
  changeDue?: number;
}

export function BillSlipModal({
  open,
  onClose,
  tableNumber,
  floorName,
  billNo,
  waiterName,
  timestamp,
  items,
  subtotal,
  serviceCharge,
  tax,
  discount,
  total,
  paymentMethod,
  amountReceived,
  changeDue,
}: BillSlipModalProps) {
  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex flex-col bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-hidden border border-border select-none">
        {/* Header (Hidden on print) */}
        <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between print:hidden">
          <div>
            <h3 className="font-extrabold text-lg text-gray-900">
              Receipt Preview &bull; {billNo || "Bill"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Table #{tableNumber} &bull; {floorName || "Dine-In"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-gray-200"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5 text-gray-500" />
          </Button>
        </div>

        {/* Bill Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-100 flex items-center justify-center print:bg-white print:p-0">
          <BillSlip
            tableNumber={tableNumber}
            floorName={floorName}
            billNo={billNo}
            waiterName={waiterName}
            timestamp={timestamp}
            items={items}
            subtotal={subtotal}
            serviceCharge={serviceCharge}
            tax={tax}
            discount={discount}
            total={total}
            paymentMethod={paymentMethod}
            amountReceived={amountReceived}
            changeDue={changeDue}
          />
        </div>

        {/* Footer (Hidden on print) */}
        <div className="p-4 border-t border-border bg-white flex items-center justify-end gap-3 print:hidden">
          <Button variant="outline" onClick={onClose} className="font-bold">
            Close
          </Button>
          <Button
            variant="primary"
            onClick={handlePrint}
            className="font-bold gap-2"
          >
            <Printer className="h-4 w-4" />
            <span>Print Bill Slip</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

