import * as React from "react";
import { Send, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BottomActionBarProps {
  onSend: () => void;
  onPay: () => void;
  sendDisabled?: boolean;
  payDisabled?: boolean;
  sendLoading?: boolean;
  payLoading?: boolean;
  sendLabel?: string;
  payLabel?: string;
  className?: string;
}

/**
 * Sticky action bar for orders.
 * Contains two large, touch-ergonomic buttons: "Send to Kitchen" and "Pay / Bill".
 * Safe-area aware for tablet home indicators.
 */
export function BottomActionBar({
  onSend,
  onPay,
  sendDisabled = false,
  payDisabled = false,
  sendLoading = false,
  payLoading = false,
  sendLabel = "Send to Kitchen",
  payLabel = "Pay / Bill",
  className,
}: BottomActionBarProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 safe-bottom",
        className
      )}
    >
      {/* Pay Button: Neutral secondary / outline styling - NOT red or green */}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={onPay}
        disabled={payDisabled}
        loading={payLoading}
        className="font-bold border-2 border-gray-300 text-gray-800 hover:bg-gray-200"
      >
        <DollarSign className="h-5 w-5 mr-1" />
        <span>{payLabel}</span>
      </Button>

      {/* Send Button: Primary Indigo brand accent */}
      <Button
        type="button"
        variant="primary"
        size="lg"
        onClick={onSend}
        disabled={sendDisabled}
        loading={sendLoading}
        className="font-bold shadow-md hover:shadow-lg"
      >
        <Send className="h-5 w-5 mr-1" />
        <span>{sendLabel}</span>
      </Button>
    </div>
  );
}

