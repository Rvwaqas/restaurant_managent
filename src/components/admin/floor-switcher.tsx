"use client";

import React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface FloorOption {
  id: string; // "f1" | "f2"
  slug: "floor-1" | "floor-2";
  name: string;
  badge: string;
}

const DEFAULT_FLOORS: FloorOption[] = [
  { id: "f1", slug: "floor-1", name: "Floor 1", badge: "Arabic" },
  { id: "f2", slug: "floor-2", name: "Floor 2", badge: "Malaysian" },
];

export interface FloorSwitcherProps {
  currentFloorId?: string;
  onFloorChange?: (floorId: string) => void;
  className?: string;
}

export function FloorSwitcher({
  currentFloorId,
  onFloorChange,
  className,
}: FloorSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // If controlled
  const activeId =
    currentFloorId ||
    (searchParams.get("floor") === "floor-2" ? "f2" : "f1");

  const handleSelect = (floor: FloorOption) => {
    if (onFloorChange) {
      onFloorChange(floor.id);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.set("floor", floor.slug);
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Floor selection"
      className={cn(
        "inline-flex p-1.5 bg-gray-100 rounded-xl border border-border select-none",
        className
      )}
    >
      {DEFAULT_FLOORS.map((floor) => {
        const isSelected = activeId === floor.id;
        return (
          <button
            key={floor.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => handleSelect(floor)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all min-h-[44px]",
              isSelected
                ? "bg-white text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-white/50"
            )}
          >
            <span>{floor.name}</span>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-md font-medium uppercase tracking-wider",
                isSelected
                  ? "bg-primary/10 text-primary"
                  : "bg-gray-200/70 text-gray-600"
              )}
            >
              {floor.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}

