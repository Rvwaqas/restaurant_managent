"use client";

import React, { useState } from "react";
import type { PeakHourCell } from "@/types";
import { formatMoney } from "@/utils/money";
import { cn } from "@/lib/utils";

interface PeakHoursHeatmapProps {
  data: PeakHourCell[];
  loading?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function PeakHoursHeatmap({ data, loading = false }: PeakHoursHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    weekday: number;
    hour: number;
    billsCount: number;
    grandTotal: number;
  } | null>(null);

  if (loading) {
    return (
      <div className="h-64 w-full flex items-center justify-center bg-gray-50/50 rounded-2xl animate-pulse">
        <span className="text-xs text-muted-foreground font-semibold">Loading peak hours data...</span>
      </div>
    );
  }

  // Create lookup map
  const matrix: Record<string, { billsCount: number; grandTotal: number }> = {};
  let maxRevenue = 1;

  for (const cell of data) {
    const key = `${cell.weekday}-${cell.hour}`;
    matrix[key] = {
      billsCount: cell.billsCount,
      grandTotal: cell.grandTotal,
    };
    if (cell.grandTotal > maxRevenue) {
      maxRevenue = cell.grandTotal;
    }
  }

  // Get background color intensity based on revenue (Indigo shades only)
  function getCellBg(amount: number): string {
    if (amount <= 0) return "bg-gray-100/70 hover:bg-gray-200";
    const ratio = amount / maxRevenue;
    if (ratio < 0.15) return "bg-indigo-100 text-indigo-900 hover:bg-indigo-200";
    if (ratio < 0.35) return "bg-indigo-200 text-indigo-950 hover:bg-indigo-300";
    if (ratio < 0.6) return "bg-indigo-400 text-white hover:bg-indigo-500";
    if (ratio < 0.85) return "bg-indigo-600 text-white hover:bg-indigo-700";
    return "bg-indigo-800 text-white hover:bg-indigo-900";
  }

  return (
    <div className="space-y-3">
      {/* Legend & Hover Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[32px]">
        <div className="text-xs">
          {hoveredCell ? (
            <span className="font-semibold text-gray-900">
              {WEEKDAYS[hoveredCell.weekday]} at {String(hoveredCell.hour).padStart(2, "0")}:00 —{" "}
              <span className="text-primary font-bold">{formatMoney(hoveredCell.grandTotal)}</span> ({hoveredCell.billsCount} bills)
            </span>
          ) : (
            <span className="text-muted-foreground">Hover or tap any slot to inspect hourly performance</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Low</span>
          <div className="w-3.5 h-3.5 rounded bg-indigo-100" />
          <div className="w-3.5 h-3.5 rounded bg-indigo-300" />
          <div className="w-3.5 h-3.5 rounded bg-indigo-500" />
          <div className="w-3.5 h-3.5 rounded bg-indigo-800" />
          <span>Peak</span>
        </div>
      </div>

      {/* Grid container with horizontal scroll */}
      <div className="overflow-x-auto pb-2 scrollbar-thin">
        <div className="min-w-[720px] select-none">
          {/* Hour labels header */}
          <div className="grid grid-cols-[50px_repeat(24,_1fr)] gap-1 mb-1 text-[10px] text-muted-foreground text-center font-mono">
            <div></div>
            {HOURS.map((h) => (
              <div key={h} className="truncate">
                {h % 3 === 0 ? `${h}h` : "·"}
              </div>
            ))}
          </div>

          {/* Days rows */}
          <div className="space-y-1">
            {WEEKDAYS.map((dayName, wIndex) => (
              <div key={dayName} className="grid grid-cols-[50px_repeat(24,_1fr)] gap-1 items-center">
                <span className="text-xs font-semibold text-gray-600 pl-1">{dayName}</span>
                {HOURS.map((hour) => {
                  const cell = matrix[`${wIndex}-${hour}`] || { billsCount: 0, grandTotal: 0 };
                  const bgClass = getCellBg(cell.grandTotal);

                  return (
                    <button
                      key={hour}
                      type="button"
                      onMouseEnter={() =>
                        setHoveredCell({
                          weekday: wIndex,
                          hour,
                          billsCount: cell.billsCount,
                          grandTotal: cell.grandTotal,
                        })
                      }
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={() =>
                        setHoveredCell({
                          weekday: wIndex,
                          hour,
                          billsCount: cell.billsCount,
                          grandTotal: cell.grandTotal,
                        })
                      }
                      className={cn(
                        "h-8 rounded-md transition-all flex items-center justify-center text-[10px] font-mono",
                        bgClass
                      )}
                      aria-label={`${dayName} ${hour}:00 - ${formatMoney(cell.grandTotal)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
export default PeakHoursHeatmap;

