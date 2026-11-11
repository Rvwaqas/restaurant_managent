"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Table, BulkCreateTablesPayload } from "@/types";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";

export interface BulkTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorId: string;
  existingTables: Table[];
  onSubmit: (payload: BulkCreateTablesPayload) => Promise<void>;
}

export function BulkTableDialog({
  open,
  onOpenChange,
  floorId,
  existingTables,
  onSubmit,
}: BulkTableDialogProps) {
  const [from, setFrom] = useState<number>(1);
  const [to, setTo] = useState<number>(10);
  const [capacity, setCapacity] = useState<number>(4);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const existingNumbersSet = useMemo(() => {
    return new Set(existingTables.filter((t) => t.isActive !== false).map((t) => t.number));
  }, [existingTables]);

  const preview = useMemo(() => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    const toCreate: number[] = [];
    const willSkip: number[] = [];

    for (let n = min; n <= max; n++) {
      if (existingNumbersSet.has(n)) {
        willSkip.push(n);
      } else {
        toCreate.push(n);
      }
    }

    return { toCreate, willSkip };
  }, [from, to, existingNumbersSet]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (from < 1 || to < 1) {
      setErrorMessage("Table numbers must be positive integers.");
      return;
    }
    if (preview.toCreate.length === 0) {
      setErrorMessage("All table numbers in this range already exist. No new tables to create.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit({ from, to, capacity });
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Failed to bulk create tables");
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
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">
                Bulk Add Table Range
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate multiple tables for {floorId === "f1" ? "Floor 1 (Halal)" : "Floor 2 (Non-Halal)"}
              </p>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from-num" className="text-sm font-semibold text-gray-700">
                From Table #
              </Label>
              <Input
                id="from-num"
                type="number"
                min="1"
                value={from}
                onChange={(e) => setFrom(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-num" className="text-sm font-semibold text-gray-700">
                To Table #
              </Label>
              <Input
                id="to-num"
                type="number"
                min="1"
                value={to}
                onChange={(e) => setTo(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default-capacity" className="text-sm font-semibold text-gray-700">
              Default Seat Capacity per Table
            </Label>
            <Input
              id="default-capacity"
              type="number"
              min="1"
              max="50"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              required
            />
          </div>

          {/* Live Range Preview */}
          <div className="p-4 bg-gray-50 border border-border rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-gray-900">
              <span>Preview:</span>
              <span className="text-primary font-bold">
                {preview.toCreate.length} new tables will be created
              </span>
            </div>

            {preview.willSkip.length > 0 && (
              <div className="text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <strong>{preview.willSkip.length} existing tables skipped:</strong>{" "}
                T-{preview.willSkip.join(", T-")}
              </div>
            )}

            {preview.toCreate.length > 0 && (
              <div className="text-gray-600">
                New tables: T-{preview.toCreate.slice(0, 15).join(", T-")}
                {preview.toCreate.length > 15 ? "..." : ""}
              </div>
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
              disabled={isSubmitting || preview.toCreate.length === 0}
              className="h-12 px-6 rounded-xl font-semibold bg-primary hover:bg-primary-hover text-white min-w-[120px]"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </span>
              ) : (
                `Add ${preview.toCreate.length} Tables`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

