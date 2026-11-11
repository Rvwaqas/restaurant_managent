import * as React from "react";
import { APP_NAME } from "@/config/app";
import { formatMoney } from "@/utils/money";
import { cn } from "@/lib/utils";

export interface BillSlipItem {
  name: string;
  qty: number;
  price: number;
  note?: string;
}

export interface BillSlipProps {
  restaurantName?: string;
  floorName?: string;
  tableNumber: number | string;
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
  footerNote?: string;
  className?: string;
}

/**
 * 80mm Thermal Cashier Bill Receipt.
 * High-contrast, pure monospace layout for ESC/POS and browser printing.
 */
export const BillSlip = React.forwardRef<HTMLDivElement, BillSlipProps>(
  (
    {
      restaurantName = APP_NAME,
      floorName,
      tableNumber,
      billNo = "B-0001",
      waiterName = "Staff",
      timestamp = new Date(),
      items,
      subtotal,
      serviceCharge = 0,
      tax = 0,
      discount = 0,
      total,
      paymentMethod = "cash",
      amountReceived,
      changeDue = 0,
      footerNote = "Thank you, visit again!",
      className,
    },
    ref
  ) => {
    const formattedDate =
      typeof timestamp === "string"
        ? new Date(timestamp).toLocaleDateString()
        : timestamp.toLocaleDateString();

    const formattedTime =
      typeof timestamp === "string"
        ? new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

    return (
      <div
        ref={ref}
        className={cn(
          "w-full max-w-[320px] bg-white text-black font-mono text-xs p-4 border border-dashed border-gray-400 select-text leading-tight print:border-none print:p-0 print:w-full print:max-w-none print:text-black",
          className
        )}
      >
        {/* Header */}
        <div className="text-center pb-2 border-b-2 border-black border-dashed space-y-0.5">
          <h2 className="text-base font-black uppercase tracking-wide">
            {restaurantName}
          </h2>
          <div className="text-[11px] font-bold uppercase">
            {floorName || "Dine-In"}
          </div>
          <div className="text-xs font-black uppercase tracking-wider mt-1 px-1 py-0.5 border border-black inline-block">
            *** FINAL BILL RECEIPT ***
          </div>
        </div>

        {/* Metadata */}
        <div className="py-2 border-b border-black border-dashed space-y-1 text-[11px]">
          <div className="flex justify-between items-baseline">
            <span className="font-bold">BILL NO:</span>
            <span className="text-sm font-black">{billNo}</span>
          </div>

          <div className="flex justify-between items-baseline">
            <span>TABLE:</span>
            <span className="text-xl font-black">#{tableNumber}</span>
          </div>

          <div className="flex justify-between">
            <span>WAITER: {waiterName}</span>
            <span>METHOD: {paymentMethod.toUpperCase()}</span>
          </div>

          <div className="flex justify-between text-[10px] text-gray-700">
            <span>{formattedDate}</span>
            <span>{formattedTime}</span>
          </div>
        </div>

        {/* Item Table */}
        <div className="py-2 border-b-2 border-black border-dashed">
          <div className="flex justify-between font-bold pb-1 mb-1 border-b border-black border-dotted text-[11px]">
            <span className="w-8 text-left">QTY</span>
            <span className="flex-1 text-left px-1">ITEM</span>
            <span className="w-16 text-right">TOTAL</span>
          </div>

          <div className="space-y-1.5">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="w-8 text-left font-bold">{item.qty}x</span>
                <span className="flex-1 text-left px-1 truncate uppercase">
                  {item.name}
                </span>
                <span className="w-16 text-right font-mono font-bold">
                  {(item.price * item.qty).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="py-2 border-b-2 border-black border-dashed space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono">{formatMoney(subtotal)}</span>
          </div>

          {serviceCharge > 0 && (
            <div className="flex justify-between">
              <span>Service Charge:</span>
              <span className="font-mono">{formatMoney(serviceCharge)}</span>
            </div>
          )}

          {tax > 0 && (
            <div className="flex justify-between">
              <span>Tax:</span>
              <span className="font-mono">{formatMoney(tax)}</span>
            </div>
          )}

          {discount > 0 && (
            <div className="flex justify-between font-bold">
              <span>Discount:</span>
              <span className="font-mono">-{formatMoney(discount)}</span>
            </div>
          )}

          <div className="pt-1.5 mt-1 border-t border-black border-dotted flex justify-between items-baseline text-sm font-black">
            <span>GRAND TOTAL:</span>
            <span className="text-base">{formatMoney(total)}</span>
          </div>

          {paymentMethod === "cash" && typeof amountReceived === "number" && (
            <div className="pt-1 text-[11px] space-y-0.5 border-t border-black border-dotted">
              <div className="flex justify-between">
                <span>Cash Received:</span>
                <span className="font-mono">{formatMoney(amountReceived)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Change Due:</span>
                <span className="font-mono">{formatMoney(changeDue)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 text-center text-[10px] space-y-1">
          <div className="font-bold uppercase tracking-wider">{footerNote}</div>
          <div className="text-gray-600">--- END OF BILL ---</div>
        </div>
      </div>
    );
  }
);

BillSlip.displayName = "BillSlip";

