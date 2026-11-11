"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  pageSize?: number;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

/**
 * Generic data table for admin management tables and reports.
 * Supports zebra striping, sticky header, responsive horizontal scrolling,
 * and built-in client-side pagination.
 */
export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  pageSize = 8,
  emptyMessage = "No records found.",
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = React.useState(1);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = data.slice(startIndex, startIndex + pageSize);

  const handlePrev = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const handleNext = () => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  };

  return (
    <div className={cn("w-full bg-white rounded-2xl border-2 border-border shadow-xs overflow-hidden select-none", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-gray-50/80 sticky top-0 z-10">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={cn(
                    "px-4 py-3.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground",
                    col.headerClassName
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIdx) => {
                const key = keyExtractor(item, startIndex + rowIdx);
                const isClickable = !!onRowClick;
                return (
                  <tr
                    key={key}
                    onClick={() => isClickable && onRowClick(item)}
                    className={cn(
                      "min-h-[48px] transition-colors",
                      rowIdx % 2 === 1 ? "bg-gray-50/40" : "bg-white",
                      isClickable && "cursor-pointer hover:bg-indigo-50/60 active:bg-indigo-100/60"
                    )}
                  >
                    {columns.map((col, colIdx) => {
                      const value = col.accessorKey ? (item[col.accessorKey] as React.ReactNode) : null;
                      return (
                        <td
                          key={colIdx}
                          className={cn("px-4 py-3 text-sm text-gray-800", col.className)}
                        >
                          {col.cell ? col.cell(item, startIndex + rowIdx) : value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {data.length > pageSize && (
        <div className="px-4 py-3 border-t border-border bg-gray-50/60 flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground font-medium">
            Showing <strong className="text-gray-900">{startIndex + 1}</strong> to{" "}
            <strong className="text-gray-900">
              {Math.min(startIndex + pageSize, data.length)}
            </strong>{" "}
            of <strong className="text-gray-900">{data.length}</strong> items
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentPage <= 1}
              className="h-9 px-3 text-xs"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prev
            </Button>
            <span className="text-xs font-bold px-2 tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={currentPage >= totalPages}
              className="h-9 px-3 text-xs"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

