import * as React from "react";
import { Users, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";

export interface TableCardProps {
  number: number | string;
  capacity: number;
  status: "free" | "occupied";
  amount?: number;
  elapsedLabel?: string;
  hasDraft?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Large table tile designed for 10" tablet fast scanning.
 * Minimum dimensions 140x120px. Strictly uses green for free and red for occupied.
 * Amber badge indicates an unsent draft exists for this table.
 */
export function TableCard({
  number,
  capacity,
  status,
  amount,
  elapsedLabel,
  hasDraft = false,
  onClick,
  className,
}: TableCardProps) {
  const isOccupied = status === "occupied";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Table ${number}`}
      data-testid={`table-card-${number}`}
      className={cn(
        "relative flex flex-col justify-between w-full min-w-[140px] min-h-[130px] p-4 rounded-2xl border-2 text-left transition-all duration-150 select-none shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-4 active:scale-[0.98]",
        isOccupied
          ? "bg-[#FEE2E2] border-[#DC2626] text-gray-900 focus-visible:ring-red-400/40"
          : "bg-[#DCFCE7] border-[#16A34A] text-gray-900 focus-visible:ring-green-400/40",
        className
      )}
    >
      {/* Top Header: Table Number & Badges */}
      <div className="flex items-start justify-between w-full gap-2">
        <div className="flex flex-col">
          <span className="text-xs uppercase font-extrabold tracking-wider opacity-75">
            Table
          </span>
          <span className="text-3xl font-extrabold tracking-tight font-mono leading-none mt-0.5">
            {number}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Amber Draft Dot / Pill if unsent draft exists */}
          {hasDraft && (
            <div
              title="Has unsent draft items"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider shadow-xs animate-pulse"
            >
              <Sparkles className="w-2.5 h-2.5" />
              <span>Draft</span>
            </div>
          )}

          {/* Capacity badge */}
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 backdrop-blur-sm border border-black/5 text-xs font-semibold text-gray-700 shadow-2xs">
            <Users className="h-3.5 w-3.5 text-gray-500" />
            <span>{capacity}</span>
          </div>
        </div>
      </div>

      {/* Bottom Area: Status details or elapsed time / running total */}
      <div className="mt-3 pt-2 border-t border-black/10 flex items-end justify-between w-full">
        {isOccupied ? (
          <>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-900">
              <Clock className="h-3.5 w-3.5 shrink-0 text-red-600" />
              <span>{elapsedLabel || "Occupied"}</span>
            </div>

            {typeof amount === "number" && (
              <div className="text-right">
                <span className="text-xs text-red-700 font-medium block leading-none">
                  Total
                </span>
                <span className="text-base font-extrabold text-red-950 tabular-nums">
                  {formatMoney(amount)}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-800">
            <span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block animate-pulse" />
            <span>Available</span>
          </div>
        )}
      </div>
    </button>
  );
}
