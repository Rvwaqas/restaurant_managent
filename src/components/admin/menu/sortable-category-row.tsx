"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Edit2, Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineSwitch } from "../inline-switch";
import type { Category, Printer as PrinterType } from "@/types";
import { cn } from "@/lib/utils";

export interface SortableCategoryRowProps {
  category: Category;
  isSelected: boolean;
  itemCount: number;
  printer?: PrinterType;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => Promise<void>;
}

export function SortableCategoryRow({
  category,
  isSelected,
  itemCount,
  printer,
  onSelect,
  onEdit,
  onDelete,
  onToggleActive,
}: SortableCategoryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between p-3 rounded-xl border transition-all select-none group",
        isDragging && "opacity-50 shadow-lg bg-white border-primary",
        isSelected
          ? "bg-primary/5 border-primary shadow-sm"
          : "bg-white border-border hover:border-gray-300 hover:bg-gray-50/50"
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0" onClick={onSelect}>
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 p-1 -ml-1 touch-none"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 cursor-pointer">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-bold truncate",
                isSelected ? "text-primary" : "text-gray-900"
              )}
            >
              {category.name}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold shrink-0">
              {itemCount}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <Printer className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            <span className="truncate max-w-[140px]">
              {printer ? printer.name : "Unassigned"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-2 shrink-0">
        <InlineSwitch
          checked={category.isActive}
          onToggle={onToggleActive}
          activeLabel="Active"
          inactiveLabel="Hidden"
        />

        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-gray-900"
            title="Edit category"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
            title="Delete category"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

