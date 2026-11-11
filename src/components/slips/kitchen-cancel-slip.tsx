import * as React from "react";
import { APP_NAME } from "@/config/app";
import { cn } from "@/lib/utils";

export interface KitchenCancelSlipProps {
  restaurantName?: string;
  tableNumber: number | string;
  floorName?: string;
  categoryName?: string;
  printerName?: string;
  itemName: string;
  qty: number;
  reason: string;
  voidedBy?: string;
  timestamp?: string | Date;
  className?: string;
}

/**
 * 80mm Kitchen Cancellation / Void Ticket.
 * Alerts kitchen staff when an already-sent item is cancelled by management.
 */
export const KitchenCancelSlip = React.forwardRef<HTMLDivElement, KitchenCancelSlipProps>(
  (
    {
      restaurantName = APP_NAME,
      tableNumber,
      floorName,
      categoryName,
      printerName,
      itemName,
      qty,
      reason,
      voidedBy = "Admin",
      timestamp = new Date(),
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
          <h2 className="text-sm font-bold uppercase">{restaurantName}</h2>
          <div className="text-sm font-black uppercase mt-1 px-2 py-1 bg-black text-white inline-block">
            *** ITEM CANCELLED ***
          </div>
          {categoryName && (
            <div className="text-xs font-black uppercase mt-1">
              [ {categoryName} STATION ]
            </div>
          )}
        </div>

        {/* Details */}
        <div className="py-2 border-b border-black border-dashed space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="font-bold">TABLE:</span>
            <span className="text-2xl font-black">#{tableNumber}</span>
          </div>

          <div className="flex justify-between text-[11px]">
            <span>FLOOR: {floorName || "Main"}</span>
            <span>AUTH: {voidedBy}</span>
          </div>

          <div className="flex justify-between text-[10px] text-gray-700">
            <span>{formattedDate}</span>
            <span>{formattedTime}</span>
          </div>
        </div>

        {/* Cancelled Item */}
        <div className="py-3 border-b-2 border-black border-dashed space-y-2">
          <div className="flex items-start">
            <span className="w-10 text-center font-black text-base text-black">
              -{qty}x
            </span>
            <span className="flex-1 pl-2 font-black uppercase text-sm line-through">
              {itemName}
            </span>
          </div>

          <div className="p-2 bg-gray-100 border border-black border-dotted text-xs font-bold">
            <div>REASON:</div>
            <div className="uppercase font-black text-sm mt-0.5">{reason}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 text-center text-[10px] space-y-0.5">
          <div className="font-bold">DO NOT PREPARE THIS DISH</div>
          <div className="text-gray-600">--- END OF CANCEL TICKET ---</div>
        </div>
      </div>
    );
  }
);

KitchenCancelSlip.displayName = "KitchenCancelSlip";

