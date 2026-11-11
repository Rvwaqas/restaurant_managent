"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useReportsStore } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Filter,
  RefreshCw,
  X,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod, ReportFilters } from "@/types";

type DatePreset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

function formatDateYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = formatDateYMD(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ymd = formatDateYMD(y);
      return { from: ymd, to: ymd };
    }
    case "last7": {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      return { from: formatDateYMD(d7), to: today };
    }
    case "thisMonth": {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: formatDateYMD(mStart), to: today };
    }
    case "lastMonth": {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: formatDateYMD(lmStart), to: formatDateYMD(lmEnd) };
    }
    default:
      return { from: today, to: today };
  }
}

function detectPreset(from: string, to: string): DatePreset {
  const presets: DatePreset[] = ["today", "yesterday", "last7", "thisMonth", "lastMonth"];
  for (const p of presets) {
    const range = getPresetDates(p);
    if (range.from === from && range.to === to) return p;
  }
  return "custom";
}

export function ReportFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const {
    filters,
    setFilters,
    updatedAt,
    fetchOverview,
  } = useReportsStore();

  const [activePreset, setActivePreset] = useState<DatePreset>(() =>
    detectPreset(filters.from, filters.to)
  );
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState(filters.from);
  const [customTo, setCustomTo] = useState(filters.to);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync from URL params on mount / navigation
  useEffect(() => {
    const urlFrom = searchParams.get("from");
    const urlTo = searchParams.get("to");
    const urlFloor = searchParams.get("floor");
    const urlWaiter = searchParams.get("waiter");
    const urlMethod = searchParams.get("method") as PaymentMethod | null;
    const urlCategory = searchParams.get("category");

    const newFilters: Partial<ReportFilters> = {};
    if (urlFrom && urlTo) {
      newFilters.from = urlFrom;
      newFilters.to = urlTo;
      setActivePreset(detectPreset(urlFrom, urlTo));
    }
    if (urlFloor) newFilters.floorId = urlFloor;
    if (urlWaiter) newFilters.waiterId = urlWaiter;
    if (urlMethod) newFilters.paymentMethod = urlMethod;
    if (urlCategory) newFilters.categoryId = urlCategory;

    if (Object.keys(newFilters).length > 0) {
      setFilters(newFilters);
    }
  }, [searchParams, setFilters]);

  // Update URL helper
  const updateUrlWithFilters = (updated: ReportFilters) => {
    const params = new URLSearchParams();
    if (updated.from) params.set("from", updated.from);
    if (updated.to) params.set("to", updated.to);
    if (updated.floorId && updated.floorId !== "all") params.set("floor", updated.floorId);
    if (updated.waiterId) params.set("waiter", updated.waiterId);
    if (updated.paymentMethod) params.set("method", updated.paymentMethod);
    if (updated.categoryId) params.set("category", updated.categoryId);

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const applyPreset = (preset: DatePreset) => {
    if (preset === "custom") {
      setShowCustomRange(true);
      return;
    }
    setActivePreset(preset);
    setShowCustomRange(false);
    const range = getPresetDates(preset);
    const nextFilters: ReportFilters = {
      ...filters,
      from: range.from,
      to: range.to,
    };
    setFilters(nextFilters);
    updateUrlWithFilters(nextFilters);
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    setActivePreset("custom");
    setShowCustomRange(false);
    const nextFilters: ReportFilters = {
      ...filters,
      from: customFrom,
      to: customTo,
    };
    setFilters(nextFilters);
    updateUrlWithFilters(nextFilters);
  };

  const handleFloorChange = (floorId: string) => {
    const nextFilters: ReportFilters = {
      ...filters,
      floorId,
    };
    setFilters(nextFilters);
    updateUrlWithFilters(nextFilters);
  };

  const handleMoreFiltersChange = (changes: Partial<ReportFilters>) => {
    const nextFilters: ReportFilters = {
      ...filters,
      ...changes,
    };
    setFilters(nextFilters);
    updateUrlWithFilters(nextFilters);
  };

  const resetMoreFilters = () => {
    const nextFilters: ReportFilters = {
      ...filters,
      waiterId: undefined,
      paymentMethod: undefined,
      categoryId: undefined,
    };
    setFilters(nextFilters);
    updateUrlWithFilters(nextFilters);
    setShowMoreFilters(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchOverview();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Count active extra filters
  const extraFilterCount = [
    filters.waiterId,
    filters.paymentMethod,
    filters.categoryId,
  ].filter(Boolean).length;

  const formattedTime = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="bg-white border border-border rounded-2xl p-3 shadow-sm space-y-3 sticky top-3 z-30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date presets chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(
            [
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "last7", label: "Last 7 Days" },
              { id: "thisMonth", label: "This Month" },
              { id: "lastMonth", label: "Last Month" },
              { id: "custom", label: activePreset === "custom" ? `${filters.from} - ${filters.to}` : "Custom Range" },
            ] as const
          ).map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  "min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all select-none",
                  isSelected
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Floor selector & controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Floor segmented control */}
          <div className="inline-flex bg-gray-100 p-1 rounded-xl">
            {[
              { id: "all", label: "All Floors" },
              { id: "f1", label: "Floor 1 (Halal)" },
              { id: "f2", label: "Floor 2 (Non-Halal)" },
            ].map((f) => {
              const active = (filters.floorId || "all") === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleFloorChange(f.id)}
                  className={cn(
                    "min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    active
                      ? "bg-white text-gray-900 shadow-sm font-bold"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* More filters button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMoreFilters(!showMoreFilters)}
            className={cn(
              "min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border-border gap-1.5",
              extraFilterCount > 0 && "border-primary text-primary bg-primary/5"
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {extraFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">
                {extraFilterCount}
              </span>
            )}
          </Button>

          {/* Refresh button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="min-h-[44px] px-3 rounded-xl text-xs text-gray-600 hover:text-gray-900 gap-1.5"
            title="Refresh data"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin text-primary")} />
            {formattedTime && (
              <span className="text-[11px] text-muted-foreground hidden lg:inline">
                {formattedTime}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Custom Range Popdown */}
      {showCustomRange && (
        <div className="pt-3 border-t border-border flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <Calendar className="w-4 h-4 text-primary" />
            <span>From:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 text-xs border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <span>To:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 text-xs border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <Button
            size="sm"
            onClick={applyCustomRange}
            className="min-h-[40px] px-4 rounded-xl text-xs font-semibold"
          >
            Apply Range
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCustomRange(false)}
            className="min-h-[40px] px-3 rounded-xl text-xs"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* More Filters Drawer/Panel */}
      {showMoreFilters && (
        <div className="pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Waiter</label>
            <select
              value={filters.waiterId || ""}
              onChange={(e) => handleMoreFiltersChange({ waiterId: e.target.value || undefined })}
              className="w-full min-h-[40px] px-3 py-1.5 text-xs border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Staff</option>
              <option value="u2">Ali Khan (Waiter 1)</option>
              <option value="u3">Zainab Ahmed (Waiter 2)</option>
              <option value="u4">David Chen (Waiter 3)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              value={filters.paymentMethod || ""}
              onChange={(e) =>
                handleMoreFiltersChange({
                  paymentMethod: (e.target.value as PaymentMethod) || undefined,
                })
              }
              className="w-full min-h-[40px] px-3 py-1.5 text-xs border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetMoreFilters}
              className="min-h-[40px] px-3 rounded-xl text-xs text-muted-foreground hover:text-gray-900 border-border"
            >
              Reset Filters
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowMoreFilters(false)}
              className="min-h-[40px] px-4 rounded-xl text-xs font-semibold ml-auto"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

