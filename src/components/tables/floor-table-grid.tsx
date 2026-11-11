"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, WifiOff, Users, Utensils, CheckCircle2, Clock } from "lucide-react";
import type { Floor, Table, TableStatus } from "@/types";
import { useTablesStore, useAuthStore, useUiStore, useCartStore } from "@/store";
import { useTablesSync } from "@/hooks/useTablesSync";
import { TableCard } from "@/components/tables/table-card";
import { TableCardSkeleton } from "@/components/ui/skeletons";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export interface FloorTableGridProps {
  floor: Floor;
}

/** Formats elapsed time string from ISO openedAt */
function formatElapsedTime(openedAt?: string): string {
  if (!openedAt) return "Occupied";
  const diffMs = Date.now() - new Date(openedAt).getTime();
  if (isNaN(diffMs) || diffMs < 0) return "Just now";
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  return `${hours}h ${remainingMins}m`;
}

/** Formats last updated relative time */
function formatLastUpdated(isoString: string | null): string {
  if (!isoString) return "";
  const diffSecs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSecs < 5) return "Updated just now";
  if (diffSecs < 60) return `Updated ${diffSecs}s ago`;
  const mins = Math.floor(diffSecs / 60);
  return `Updated ${mins}m ago`;
}

export function FloorTableGrid({ floor }: FloorTableGridProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setLastVisitedFloor } = useUiStore();
  const { items, status, changedTableIds, counts } = useTablesStore();
  const drafts = useCartStore((s) => s.drafts);

  // Remember this visited floor for the user
  React.useEffect(() => {
    if (user?.id) {
      setLastVisitedFloor(user.id, floor.slug);
    }
  }, [user?.id, floor.slug, setLastVisitedFloor]);

  // Connect polling and network sync
  const { isOnline, isRefreshing, lastUpdated, manualRefresh } = useTablesSync(floor.id);

  // Filter & search states
  const [statusFilter, setStatusFilter] = React.useState<"all" | "free" | "occupied">("all");
  const [searchNumber, setSearchNumber] = React.useState("");

  // Minute ticker to re-render elapsed times without network fetch
  const [, setMinuteTick] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setMinuteTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const floorTables = React.useMemo(() => items[floor.id] || [], [items, floor.id]);
  const { total, free, occupied } = counts(floor.id);

  // Filter tables by status and number
  const filteredTables = React.useMemo(() => {
    return floorTables.filter((table) => {
      // 1. Status filter
      if (statusFilter !== "all" && table.status !== statusFilter) {
        return false;
      }
      // 2. Search query by number
      if (searchNumber.trim()) {
        const query = searchNumber.trim().replace(/^t-?/i, "");
        if (!String(table.number).includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [floorTables, statusFilter, searchNumber]);

  // Handle table card tap with haptic feedback & navigation
  const handleTableTap = (table: Table) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // ignore
      }
    }
    router.push(`/${floor.slug}/table/${table.id}`);
  };

  // Prefetch table order route on hover or touchstart for instant navigation
  const handleTablePrefetch = (table: Table) => {
    router.prefetch(`/${floor.slug}/table/${table.id}`);
  };

  const isInitialLoading = status === "loading" && floorTables.length === 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full select-none safe-top safe-bottom">
      {/* 1. Header with Floor Name, Menu Badge, and Manual Refresh */}
      <PageHeader
        title={`${floor.name} Tables`}
        subtitle={`Tap any table to start or manage orders. Real-time sync via WiFi.`}
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground font-semibold hidden md:inline tabular-nums">
                {formatLastUpdated(lastUpdated)}
              </span>
            )}
            <IconButton
              aria-label="Refresh floor tables"
              variant="outline"
              size="md"
              onClick={manualRefresh}
              className="border-border text-gray-700 hover:bg-gray-100"
            >
              <RefreshCw
                className={cn("h-5 w-5", isRefreshing && "animate-spin text-primary")}
              />
            </IconButton>
          </div>
        }
      />

      {/* Offline / Reconnecting Warning Banner */}
      {!isOnline && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-900 text-xs sm:text-sm font-bold flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-5 w-5 text-amber-600 shrink-0" />
            <span>Cannot reach local server. Showing last saved table data. Reconnecting...</span>
          </div>
          <button
            type="button"
            onClick={manualRefresh}
            className="px-3 py-1.5 rounded-xl bg-amber-200/70 hover:bg-amber-200 text-amber-950 font-extrabold text-xs shrink-0"
          >
            Retry Now
          </button>
        </div>
      )}

      {/* 2. Summary KPI Strip: Total, Free (Green), Occupied (Red) */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {/* Total Tables */}
        <div className="p-4 rounded-2xl bg-white border-2 border-border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Total Tables
            </span>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 tabular-nums mt-0.5">
              {total}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
            <Utensils className="h-5 w-5" />
          </div>
        </div>

        {/* Free Tables (Strict Green) */}
        <div className="p-4 rounded-2xl bg-[#DCFCE7] border-2 border-[#16A34A] shadow-xs flex items-center justify-between text-green-950">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-green-800">
              Available
            </span>
            <div className="text-2xl sm:text-3xl font-black tabular-nums mt-0.5 text-green-950">
              {free}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center text-[#16A34A] shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Occupied Tables (Strict Red) */}
        <div className="p-4 rounded-2xl bg-[#FEE2E2] border-2 border-[#DC2626] shadow-xs flex items-center justify-between text-red-950">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-red-800">
              Occupied
            </span>
            <div className="text-2xl sm:text-3xl font-black tabular-nums mt-0.5 text-red-950">
              {occupied}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center text-[#DC2626] shrink-0">
            <Clock className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* 3. Filter Row: Segmented Control (All / Free / Occupied) + Numeric Table Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Segmented control buttons */}
        <div
          role="tablist"
          aria-label="Filter tables by status"
          className="inline-flex items-center p-1 bg-gray-100 rounded-xl border border-border min-h-[48px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-150 min-h-[40px] flex-1 sm:flex-initial",
              statusFilter === "all"
                ? "bg-white text-primary shadow-xs ring-1 ring-black/5"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            All Tables ({total})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "free"}
            onClick={() => setStatusFilter("free")}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-150 min-h-[40px] flex-1 sm:flex-initial",
              statusFilter === "free"
                ? "bg-white text-green-700 shadow-xs ring-1 ring-black/5"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            Free ({free})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "occupied"}
            onClick={() => setStatusFilter("occupied")}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-150 min-h-[40px] flex-1 sm:flex-initial",
              statusFilter === "occupied"
                ? "bg-white text-red-700 shadow-xs ring-1 ring-black/5"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            Occupied ({occupied})
          </button>
        </div>

        {/* Search by table number (inputMode numeric for tablet on-screen keypad) */}
        <div className="w-full sm:w-64">
          <SearchInput
            value={searchNumber}
            onChange={setSearchNumber}
            placeholder="Search table #..."
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </div>
      </div>

      {/* 4. Table Cards Grid */}
      {isInitialLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <TableCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredTables.length === 0 ? (
        <EmptyState
          title="No tables match your filter"
          description="Try changing the status filter (All / Free / Occupied) or clear the table search number."
          action={
            (statusFilter !== "all" || searchNumber) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setSearchNumber("");
                }}
                className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl"
              >
                Reset Filters
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredTables.map((table) => {
            const isOccupied = table.status === "occupied";
            const isChangedRecently = changedTableIds.includes(table.id);

            return (
              <div
                key={table.id}
                onMouseEnter={() => handleTablePrefetch(table)}
                onTouchStart={() => handleTablePrefetch(table)}
                className={cn(
                  "transition-all duration-300 rounded-2xl",
                  isChangedRecently && "ring-4 ring-primary animate-pulse scale-[1.02]"
                )}
              >
                <TableCard
                  number={table.number}
                  capacity={table.capacity}
                  status={table.status}
                  amount={isOccupied ? table.runningTotal : undefined}
                  elapsedLabel={isOccupied ? formatElapsedTime(table.openedAt) : undefined}
                  hasDraft={Boolean(drafts[table.id]?.items?.length)}
                  onClick={() => handleTableTap(table)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-3 rounded-full bg-[#16A34A]" />
            <span>Green = Available</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-3 rounded-full bg-[#DC2626]" />
            <span>Red = Occupied</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span>Amber = Draft (unsent)</span>
          </div>
        </div>
        <span className="hidden sm:inline">Auto-syncs every 5s over WiFi</span>
      </div>
    </div>
  );
}
