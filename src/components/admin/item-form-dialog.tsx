"use client";

import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
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
import { ImageUploader } from "./image-uploader";
import type { MenuItem, Category } from "@/types";
import { AlertCircle, Loader2 } from "lucide-react";

const itemSchema = z.object({
  name: z.string().min(1, "Dish name is required").max(80, "Name too long"),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  image: z.string().optional(),
  available: z.boolean(),
  isActive: z.boolean(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

export interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: MenuItem | null;
  floorId: string;
  categories: Category[];
  onSubmit: (values: ItemFormValues) => Promise<void>;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  floorId,
  categories,
  onSubmit,
}: ItemFormDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      price: 0,
      categoryId: categories[0]?.id || "",
      description: "",
      image: "",
      available: true,
      isActive: true,
    },
  });

  const watchCategoryId = watch("categoryId");
  const watchAvailable = watch("available");
  const watchIsActive = watch("isActive");

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      if (item) {
        reset({
          name: item.name,
          price: item.price,
          categoryId: item.categoryId,
          description: item.description || "",
          image: item.image || "",
          available: item.available,
          isActive: item.isActive,
        });
      } else {
        reset({
          name: "",
          price: 0,
          categoryId: categories[0]?.id || "",
          description: "",
          image: "",
          available: true,
          isActive: true,
        });
      }
    }
  }, [open, item, reset, categories]);

  const onFormSubmit = async (values: ItemFormValues) => {
    setErrorMessage(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Failed to save menu item");
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {item ? "Edit Menu Dish" : "Add Menu Dish"}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="item-name" className="text-sm font-semibold text-gray-700">
                Dish Name *
              </Label>
              <Input
                id="item-name"
                placeholder="e.g. Chicken Biryani, Chocolate Lava Cake"
                {...register("name")}
                autoFocus
              />
              {errors.name && (
                <p className="text-xs text-red-600 font-medium">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">
                Food Category *
              </Label>
              <Select
                value={watchCategoryId}
                onValueChange={(val) => setValue("categoryId", val, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p className="text-xs text-red-600 font-medium">{errors.categoryId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-price" className="text-sm font-semibold text-gray-700">
                Price (RM) *
              </Label>
              <Input
                id="item-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="25.00"
                {...register("price")}
              />
              {errors.price && (
                <p className="text-xs text-red-600 font-medium">{errors.price.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-desc" className="text-sm font-semibold text-gray-700">
              Description (Optional)
            </Label>
            <Input
              id="item-desc"
              placeholder="e.g. Served with spicy raita and salad"
              {...register("description")}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Dish Image
            </Label>
            <Controller
              name="image"
              control={control}
              render={({ field }) => (
                <ImageUploader
                  value={field.value}
                  onChange={(url) => field.onChange(url)}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-gray-50/50">
              <div>
                <Label className="text-sm font-semibold text-gray-800">
                  Available in Kitchen
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {watchAvailable ? "In stock" : "Sold out"}
                </p>
              </div>
              <Switch
                checked={watchAvailable}
                onCheckedChange={(checked) =>
                  setValue("available", checked, { shouldDirty: true })
                }
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-gray-50/50">
              <div>
                <Label className="text-sm font-semibold text-gray-800">
                  Active in POS
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {watchIsActive ? "Visible" : "Hidden from waiters"}
                </p>
              </div>
              <Switch
                checked={watchIsActive}
                onCheckedChange={(checked) =>
                  setValue("isActive", checked, { shouldDirty: true })
                }
              />
            </div>
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
              ) : item ? (
                "Save Changes"
              ) : (
                "Add Dish"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

