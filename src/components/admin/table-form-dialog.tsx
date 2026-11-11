"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { Switch } from "@/components/ui/switch";
import type { Table } from "@/types";
import { AlertCircle, Loader2 } from "lucide-react";

const tableSchema = z.object({
  number: z.coerce.number().int().min(1, "Table number must be at least 1"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1 seat").max(50, "Max 50 seats"),
  isActive: z.boolean(),
});

type TableFormValues = z.infer<typeof tableSchema>;

export interface TableFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table?: Table | null;
  floorId: string;
  onSubmit: (values: TableFormValues) => Promise<void>;
}

export function TableFormDialog({
  open,
  onOpenChange,
  table,
  floorId,
  onSubmit,
}: TableFormDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TableFormValues>({
    resolver: zodResolver(tableSchema),
    defaultValues: {
      number: 1,
      capacity: 4,
      isActive: true,
    },
  });

  const watchIsActive = watch("isActive");

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      if (table) {
        reset({
          number: table.number,
          capacity: table.capacity,
          isActive: table.isActive,
        });
      } else {
        reset({
          number: 1,
          capacity: 4,
          isActive: true,
        });
      }
    }
  }, [open, table, reset]);

  const onFormSubmit = async (values: TableFormValues) => {
    setErrorMessage(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Failed to save table");
      setErrorMessage(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {table ? `Edit Table T-${table.number}` : "Add New Table"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configured for {floorId === "f1" ? "Floor 1 (Halal)" : "Floor 2 (Non-Halal)"}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 mt-2">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="table-number" className="text-sm font-semibold text-gray-700">
                Table Number *
              </Label>
              <Input
                id="table-number"
                type="number"
                min="1"
                placeholder="1"
                {...register("number")}
                autoFocus
              />
              {errors.number && (
                <p className="text-xs text-red-600 font-medium">{errors.number.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="table-capacity" className="text-sm font-semibold text-gray-700">
                Seat Capacity *
              </Label>
              <Input
                id="table-capacity"
                type="number"
                min="1"
                max="50"
                placeholder="4"
                {...register("capacity")}
              />
              {errors.capacity && (
                <p className="text-xs text-red-600 font-medium">{errors.capacity.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-gray-50/50">
            <div>
              <Label className="text-sm font-semibold text-gray-800">
                Active in Waiter Grid
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When inactive, waiters cannot open orders on this table.
              </p>
            </div>
            <Switch
              checked={watchIsActive}
              onCheckedChange={(checked) => setValue("isActive", checked)}
            />
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
              disabled={isSubmitting}
              className="h-12 px-6 rounded-xl font-semibold bg-primary hover:bg-primary-hover text-white min-w-[120px]"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : table ? (
                "Save Changes"
              ) : (
                "Create Table"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

