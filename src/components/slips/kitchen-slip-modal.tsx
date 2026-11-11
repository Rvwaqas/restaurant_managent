"use client";

import * as React from "react";
import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KitchenSlip, type KitchenSlipItem } from "./kitchen-slip";

export interface SlipData {
  categoryId?: string;
  categoryName?: string;
  printerName?: string;
  items: KitchenSlipItem[];
}

export interface KitchenSlipModalProps {
  open: boolean;
  onClose: () => void;
  tableNumber: number | string;
  floorName?: string;
  waiterName?: string;
  batchNo: number;
  timestamp?: string | Date;
  slips: SlipData[];
}

export function KitchenSlipModal({
  open,
  onClose,
  tableNumber,
  floorName,
  waiterName,
  batchNo,
  timestamp,
  slips,
}: KitchenSlipModalProps) {
  const [selectedIdx, setSelectedIdx] = React.useState(0);

  React.useEffect(() => {
    setSelectedIdx(0);
  }, [open]);

  if (!open) return null;

  const currentSlip = slips[selectedIdx] || slips[0];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex flex-col bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden border border-border">
        {/* Header (Hidden on print) */}
        <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between print:hidden">
          <div>
            <h3 className="font-extrabold text-lg text-gray-900">
              Kitchen Slip Preview
            </h3>
            <p className="text-xs text-muted-foreground">
              Table #{tableNumber} &bull; Batch #{batchNo}
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

        {/* Tab selector if multiple categories (Hidden on print) */}
        {slips.length > 1 && (
          <div className="p-2 bg-gray-100 border-b border-border flex items-center gap-1.5 overflow-x-auto print:hidden">
            {slips.map((slip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedIdx === i
                    ? "bg-white text-primary shadow-xs"
                    : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
                }`}
              >
                {slip.categoryName || `Station ${i + 1}`} ({slip.items.length})
              </button>
            ))}
          </div>
        )}

        {/* Slip Preview Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-100 flex items-center justify-center print:bg-white print:p-0">
          {currentSlip ? (
            <KitchenSlip
              tableNumber={tableNumber}
              floorName={floorName}
              waiterName={waiterName}
              batchNo={batchNo}
              categoryName={currentSlip.categoryName}
              printerName={currentSlip.printerName}
              timestamp={timestamp}
              items={currentSlip.items}
            />
          ) : (
            <p className="text-sm text-gray-500">No slip data available.</p>
          )}
        </div>

        {/* Footer actions (Hidden on print) */}
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
            <span>Print Slip</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
