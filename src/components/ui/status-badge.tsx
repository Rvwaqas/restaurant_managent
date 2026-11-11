import * as React from "react";
import { cn } from "@/lib/utils";

export type EntityStatus =
  | "free"
  | "occupied"
  | "paid"
  | "open"
  | "cancelled"
  | "available"
  | "unavailable";

export interface StatusBadgeProps {
  status: EntityStatus;
  label?: string;
  pulse?: boolean;
  className?: string;
}

const statusConfig: Record<
  EntityStatus,
  { defaultLabel: string; bg: string; text: string; border: string; dot: string }
> = {
  free: {
    defaultLabel: "Free",
    bg: "bg-[#DCFCE7]",
    text: "text-[#166534]",
    border: "border-[#86EFAC]",
    dot: "bg-[#16A34A]",
  },
  occupied: {
    defaultLabel: "Occupied",
    bg: "bg-[#FEE2E2]",
    text: "text-[#991B1B]",
    border: "border-[#FCA5A5]",
    dot: "bg-[#DC2626]",
  },
  paid: {
    defaultLabel: "Paid",
    bg: "bg-[#DBEAFE]",
    text: "text-[#1E40AF]",
    border: "border-[#93C5FD]",
    dot: "bg-[#2563EB]",
  },
  open: {
    defaultLabel: "Open",
    bg: "bg-[#FEF3C7]",
    text: "text-[#92400E]",
    border: "border-[#FCD34D]",
    dot: "bg-[#D97706]",
  },
  cancelled: {
    defaultLabel: "Cancelled",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-300",
    dot: "bg-gray-400",
  },
  available: {
    defaultLabel: "Available",
    bg: "bg-[#DCFCE7]",
    text: "text-[#166534]",
    border: "border-[#86EFAC]",
    dot: "bg-[#16A34A]",
  },
  unavailable: {
    defaultLabel: "Unavailable",
    bg: "bg-gray-100",
    text: "text-gray-500",
    border: "border-gray-300",
    dot: "bg-gray-400",
  },
};

/**
 * StatusBadge strictly enforces semantic color rules for restaurant entities:
 * Green = Free/Available, Red = Occupied, Amber = Open/Pending, Blue = Paid.
 */
export function StatusBadge({
  status,
  label,
  pulse = false,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.free;
  const displayLabel = label || config.defaultLabel;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border select-none tracking-wide",
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          config.dot,
          pulse && "animate-pulse"
        )}
      />
      <span>{displayLabel}</span>
    </span>
  );
}

