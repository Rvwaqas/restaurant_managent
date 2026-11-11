"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MenuItem, Category } from "@/types";
import { categoriesService } from "@/lib/api/services";
import { Copy, AlertCircle, Loader2 } from "lucide-react";

export interface DuplicateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MenuItem | null;
  currentFloorId: string;
  onConfirm: (targetFloorId: string, targetCategoryId: string) => Promise<void>;
}

export function DuplicateItemDialog({
  open,
  onOpenChange,
  item,
  currentFloorId,
  onConfirm,
}: DuplicateItemDialogProps) {
  const targetFloorId = currentFloorId === "f1" ? "f2" : "f1";
  const targetFloorLabel =
    targetFloorId === "f1" ? "Floor 1 (Halal)" : "Floor 2 (Non-Halal)";

  const [targetCategories, setTargetCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [isLoadingCats, setIsLoadingCats] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open && item) {
      setErrorMessage(null);
      setIsLoadingCats(true);
      categoriesService
        .listByFloor(targetFloorId)
        .then((cats) => {
          const activeCats = cats.filter((c) => c.isActive !== false);
          setTargetCategories(activeCats);
          if (activeCats.length > 0) {
            setSelectedCategoryId(activeCats[0].id);
          }
        })
        .catch((err) => {
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to load categories for target floor"
          );
        })
        .finally(() => {
          setIsLoadingCats(false);
        });
    }
  }, [open, item, targetFloorId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId) {
      setErrorMessage("Please select a target category.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(targetFloorId, selectedCategoryId);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Failed to duplicate item");
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">
                Duplicate Dish to Other Floor
              </DialogTitle>
              {item && (
                <p className="text-sm font-semibold text-gray-700 mt-0.5">
                  &ldquo;{item.name}&rdquo;
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="p-3 bg-gray-50 border border-border rounded-xl text-xs text-gray-700">
            <div className="font-semibold text-gray-900 mb-1">Target Destination:</div>
            <div>This will create a copy of the dish in <strong>{targetFloorLabel}</strong>.</div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Select Category on {targetFloorLabel} *
            </Label>
            {isLoadingCats ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading categories...
              </div>
            ) : targetCategories.length === 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-200">
                No active categories found on {targetFloorLabel}. Please create a category on that floor first.
              </div>
            ) : (
              <Select
                value={selectedCategoryId}
                onValueChange={setSelectedCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {targetCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter className="mt-6 flex flex-row gap-2.5 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-12 px-5 rounded-xl font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isLoadingCats || targetCategories.length === 0}
              className="h-12 px-6 rounded-xl font-semibold bg-primary hover:bg-primary-hover text-white min-w-[120px]"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Duplicating...
                </span>
              ) : (
                "Duplicate Dish"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

