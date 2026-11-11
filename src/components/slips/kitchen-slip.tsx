import * as React from "react";
import { APP_NAME } from "@/config/app";
import { cn } from "@/lib/utils";

export interface KitchenSlipItem {
  name: string;
  qty: number;
  note?: string;
}

export interface KitchenSlipProps {
  restaurantName?: string;
  tableNumber: number | string;
  floorName?: string;
  waiterName?: string;
  batchNo: number;
  categoryName?: string;
  printerName?: string;
  timestamp?: string | Date;
  items: KitchenSlipItem[];
  className?: string;
}

/**
 * High-contrast 80mm Kitchen Order Ticket (KOT) thermal slip component.
 * Pure monospace layout with dashed lines for crisp thermal printer output.
 */
export const KitchenSlip = React.forwardRef<HTMLDivElement, KitchenSlipProps>(
  (
    {
      restaurantName = APP_NAME,
      tableNumber,
      floorName,
      waiterName,
      batchNo,
      categoryName,
      printerName,
      timestamp = new Date(),
      items,
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
            second: "2-digit",
          })
        : timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
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
        <div className="text-center pb-2 border-b-2 border-black border-dashed">
          <h2 className="text-base font-bold uppercase tracking-wide">{restaurantName}</h2>
          <div className="text-[13px] font-black uppercase mt-1 px-1 py-0.5 border border-black inline-block">
            *** KITCHEN ORDER TICKET ***
          </div>
          {categoryName && (
            <div className="text-sm font-black uppercase mt-1 tracking-wider">
              [ {categoryName} STATION ]
            </div>
          )}
        </div>

        {/* Key Info Grid */}
        <div className="py-2 border-b border-black border-dashed space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-xs uppercase">TABLE:</span>
            <span className="text-2xl font-black">#{tableNumber}</span>
          </div>

          <div className="flex justify-between text-[11px]">
            <span>FLOOR: {floorName || "Main"}</span>
            <span className="font-bold">BATCH #{batchNo}</span>
          </div>

          <div className="flex justify-between text-[11px]">
            <span>WAITER: {waiterName || "Staff"}</span>
            {printerName && <span>PRN: {printerName}</span>}
          </div>

          <div className="flex justify-between text-[10px] text-gray-700">
            <span>{formattedDate}</span>
            <span>{formattedTime}</span>
          </div>
        </div>

        {/* Item Table */}
        <div className="py-2 border-b-2 border-black border-dashed">
          <div className="flex justify-between font-bold pb-1 mb-1 border-b border-black border-dotted text-[11px]">
            <span className="w-10 text-center">QTY</span>
            <span className="flex-1 text-left pl-2">ITEM</span>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="text-xs">
                <div className="flex items-start">
                  <span className="w-10 text-center font-black text-sm">
                    {item.qty}x
                  </span>
                  <span className="flex-1 pl-2 font-bold uppercase">
                    {item.name}
                  </span>
                </div>
                {item.note && (
                  <div className="pl-12 text-[11px] font-extrabold italic text-black">
                    ** NOTE: {item.note} **
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 text-center text-[10px] space-y-0.5">
          <div>TOTAL ITEMS: {items.reduce((s, it) => s + it.qty, 0)}</div>
          <div className="italic font-bold">--- END OF TICKET ---</div>
        </div>
      </div>
    );
  }
);

KitchenSlip.displayName = "KitchenSlip";
