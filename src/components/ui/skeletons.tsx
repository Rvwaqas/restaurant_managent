import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton loading card matching TableCard dimensions (140x130px min).
 */
export function TableCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between w-full min-w-[140px] min-h-[130px] p-4 rounded-2xl border-2 border-gray-200 bg-white",
        className
      )}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-8 w-14 rounded-lg" />
        </div>
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>

      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
        <Skeleton className="h-4 w-16 rounded" />
        <Skeleton className="h-4 w-12 rounded" />
      </div>
    </div>
  );
}

/**
 * Skeleton loading tile matching MenuItemCard.
 */
export function MenuItemSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between w-full min-h-[200px] p-3 rounded-2xl border-2 border-gray-200 bg-white",
        className
      )}
    >
      <Skeleton className="w-full h-32 rounded-xl" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded" />
        <div className="flex justify-between items-center pt-2">
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton row for tables and lists.
 */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-14 w-full bg-white rounded-xl border border-border p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-40 rounded" />
          </div>
          <Skeleton className="h-4 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}

