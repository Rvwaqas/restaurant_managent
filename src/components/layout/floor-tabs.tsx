"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore, useFloorsStore } from "@/store";
import type { FloorSlug } from "@/types";

export interface FloorTabsProps {
  className?: string;
}

/**
 * Dynamic floor switcher in the waiter top bar.
 * Fetches floors from floorsService/floorsStore.
 * Shows only floors accessible to the active staff user.
 * If the user only has access to one floor, renders as a static badge.
 */
export function FloorTabs({ className }: FloorTabsProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { floors, fetchFloors, status } = useFloorsStore();

  React.useEffect(() => {
    if (status === "idle") {
      fetchFloors();
    }
  }, [status, fetchFloors]);

  // Filter based on user allowedFloors
  const accessibleFloors = React.useMemo(() => {
    const list = floors.length > 0 ? floors : [
      { id: "f1", slug: "floor-1" as const, name: "Floor 1", menuType: "halal" as const },
      { id: "f2", slug: "floor-2" as const, name: "Floor 2", menuType: "non-halal" as const },
    ];
    if (!user || user.role === "admin" || !user.allowedFloors || user.allowedFloors.length === 0) {
      return list;
    }
    return list.filter((f) => user.allowedFloors?.includes(f.slug as FloorSlug));
  }, [floors, user]);

  // If user has access to only 1 floor (e.g. waiter3), show static label
  if (accessibleFloors.length === 1) {
    const single = accessibleFloors[0];
    const singleName = single.name.replace(/\s*\([^)]*\)/g, "");
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2.5 px-4 py-2 bg-gray-100 rounded-xl border border-border select-none",
          className
        )}
      >
        <span className="font-extrabold text-sm text-gray-900">{singleName}</span>
        <span
          className={cn(
            "text-[10px] font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase",
            single.menuType === "halal"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          )}
        >
          {single.menuType === "halal" ? "ARABIC" : "MALAYSIAN"}
        </span>
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Floor selection"
      className={cn(
        "inline-flex items-center p-1 bg-gray-100 rounded-xl border border-border select-none",
        className
      )}
    >
      {accessibleFloors.map((floor) => {
        const isActive = pathname.startsWith(`/${floor.slug}`);
        const isHalal = floor.menuType === "halal";

        const displayName = floor.name.replace(/\s*\([^)]*\)/g, "");

        return (
          <Link
            key={floor.slug}
            href={`/${floor.slug}`}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg text-sm font-bold transition-all duration-150 active:scale-[0.98]",
              isActive
                ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
            )}
          >
            <span>{displayName}</span>
            <span
              className={cn(
                "text-[10px] font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase",
                isHalal
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              )}
            >
              {isHalal ? "ARABIC" : "MALAYSIAN"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
