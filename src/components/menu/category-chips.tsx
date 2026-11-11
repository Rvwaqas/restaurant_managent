import * as React from "react";
import { cn } from "@/lib/utils";

export interface CategoryItem {
  id: string;
  name: string;
  count?: number;
}

export interface CategoryChipProps {
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * Single Category Chip with 48px min height and tablet-friendly tap styling.
 */
export function CategoryChip({
  label,
  active = false,
  count,
  onClick,
  className,
}: CategoryChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 min-h-[48px] px-5 py-2.5 rounded-full text-base font-medium whitespace-nowrap transition-all duration-150 select-none active:scale-[0.98]",
        active
          ? "bg-primary text-white shadow-md font-semibold ring-2 ring-primary/30"
          : "bg-white text-gray-700 border-2 border-border hover:bg-gray-50 hover:border-gray-300 shadow-sm",
        className
      )}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-full tabular-nums",
            active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export interface CategoryChipsProps {
  categories: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showAll?: boolean;
  allLabel?: string;
  allCount?: number;
  className?: string;
}

/**
 * Horizontally scrollable row of category chips.
 * Supports touch drag / swipe without visible scrollbar.
 */
export function CategoryChips({
  categories,
  selectedId,
  onSelect,
  showAll = true,
  allLabel = "All Items",
  allCount,
  className,
}: CategoryChipsProps) {
  return (
    <div
      role="tablist"
      aria-label="Menu categories"
      className={cn(
        "flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1",
        className
      )}
    >
      {showAll && (
        <CategoryChip
          label={allLabel}
          count={allCount}
          active={selectedId === null || selectedId === "all"}
          onClick={() => onSelect("all")}
        />
      )}
      {categories.map((cat) => (
        <CategoryChip
          key={cat.id}
          label={cat.name}
          count={cat.count}
          active={selectedId === cat.id}
          onClick={() => onSelect(cat.id)}
        />
      ))}
    </div>
  );
}

