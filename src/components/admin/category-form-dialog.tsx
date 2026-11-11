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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category, Printer } from "@/types";
import { AlertCircle, Loader2 } from "lucide-react";

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(50, "Name too long"),
  printerId: z.string().min(1, "Printer assignment is required"),
  isActive: z.boolean(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  floorId: string;
  printers: Printer[];
  onSubmit: (values: CategoryFormValues) => Promise<void>;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  floorId,
  printers,
  onSubmit,
}: CategoryFormDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      printerId: printers[0]?.id || "",
      isActive: true,
    },
  });

  const watchPrinterId = watch("printerId");
  const watchIsActive = watch("isActive");

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      if (category) {
        reset({
          name: category.name,
          printerId: category.printerId,
          isActive: category.isActive,
        });
      } else {
        reset({
          name: "",
          printerId: printers[0]?.id || "",
          isActive: true,
        });
      }
    }
  }, [open, category, reset, printers]);

  const onFormSubmit = async (values: CategoryFormValues) => {
    setErrorMessage(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Failed to save category");
      setErrorMessage(msg);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && isDirty && !isSubmitting) {
      if (!window.confirm("You have unsaved changes. Discard them?")) {
        return;
      }
    }
    setErrorMessage(null);
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {category ? "Edit Category" : "New Food Category"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configured for {floorId === "f1" ? "Floor 1 (Arabic)" : "Floor 2 (Malaysian)"}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 mt-2">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="category-name" className="text-sm font-semibold text-gray-700">
              Category Name *
            </Label>
            <Input
              id="category-name"
              placeholder="e.g. Sweet, Spicy, Drinks, Desserts"
              {...register("name")}
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-red-600 font-medium">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Target Kitchen Thermal Printer *
            </Label>
            <Select
              value={watchPrinterId}
              onValueChange={(val) => setValue("printerId", val, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select target printer" />
              </SelectTrigger>
              <SelectContent>
                {printers.map((printer) => (
                  <SelectItem key={printer.id} value={printer.id}>
                    {printer.name} ({printer.ip}:{printer.port}) -{" "}
                    {printer.role === "cashier" ? "Cashier" : "Kitchen"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.printerId && (
              <p className="text-xs text-red-600 font-medium">{errors.printerId.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Orders sent in this category print kitchen slips directly to this device.
            </p>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-gray-50/50">
            <div>
              <Label className="text-sm font-semibold text-gray-800">
                Active in Waiter Menu
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When turned off, this category and its dishes are hidden from waiters.
              </p>
            </div>
            <Switch
              checked={watchIsActive}
              onCheckedChange={(checked) =>
                setValue("isActive", checked, { shouldDirty: true })
              }
            />
          </div>

          <DialogFooter className="mt-6 flex flex-row gap-2.5 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
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
              ) : category ? (
                "Save Changes"
              ) : (
                "Create Category"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

