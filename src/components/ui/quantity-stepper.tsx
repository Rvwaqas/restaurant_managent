import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  className?: string;
  size?: "md" | "lg";
  disabled?: boolean;
}

/**
 * Tablet-optimized Quantity Stepper.
 * Minimum 48x48px tap targets for buttons with clear tactile feedback.
 */
export function QuantityStepper({
  value,
  min = 1,
  max = 999,
  onChange,
  className,
  size = "md",
  disabled = false,
}: QuantityStepperProps) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canDecrease) {
      onChange(value - 1);
    }
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canIncrease) {
      onChange(value + 1);
    }
  };

  const btnSize = size === "lg" ? "w-14 h-14 text-lg" : "w-12 h-12 text-base";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 bg-gray-100 rounded-xl p-1 select-none",
        className
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={handleDecrease}
        disabled={!canDecrease}
        className={cn(
          btnSize,
          "flex items-center justify-center rounded-lg font-bold transition-all duration-150",
          canDecrease
            ? "bg-white text-gray-800 shadow-sm hover:bg-gray-50 active:scale-[0.92]"
            : "text-gray-300 bg-transparent cursor-not-allowed"
        )}
      >
        <Minus className="h-5 w-5" />
      </button>

      <span className="min-w-[40px] px-2 text-center font-bold text-lg text-gray-900 tabular-nums">
        {value}
      </span>

      <button
        type="button"
        aria-label="Increase quantity"
        onClick={handleIncrease}
        disabled={!canIncrease}
        className={cn(
          btnSize,
          "flex items-center justify-center rounded-lg font-bold transition-all duration-150",
          canIncrease
            ? "bg-primary text-white shadow-sm hover:bg-primary-hover active:scale-[0.92]"
            : "text-gray-300 bg-transparent cursor-not-allowed"
        )}
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

