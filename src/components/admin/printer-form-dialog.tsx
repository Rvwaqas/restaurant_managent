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
import type { Printer, PrinterRole } from "@/types";
import { AlertCircle, Loader2 } from "lucide-react";

// IPv4 regex validation
const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const printerSchema = z.object({
  name: z.string().min(1, "Printer name is required").max(60, "Name too long"),
  ip: z.string().regex(ipv4Regex, "Must be a valid IPv4 address (e.g. 192.168.1.200)"),
  port: z.coerce.number().int().min(1).max(65535, "Port must be 1-65535"),
  role: z.enum(["kitchen", "cashier"] as const),
  isActive: z.boolean(),
});

type PrinterFormValues = z.infer<typeof printerSchema>;

export interface PrinterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printer?: Printer | null;
  onSubmit: (values: PrinterFormValues) => Promise<void>;
}

export function PrinterFormDialog({
  open,
  onOpenChange,
  printer,
  onSubmit,
}: PrinterFormDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PrinterFormValues>({
    resolver: zodResolver(printerSchema),
    defaultValues: {
      name: "",
      ip: "192.168.1.200",
      port: 9100,
      role: "kitchen",
      isActive: true,
    },
  });

  const watchRole = watch("role");
  const watchIsActive = watch("isActive");

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      if (printer) {
        reset({
          name: printer.name,
          ip: printer.ip,
          port: printer.port,
          role: printer.role,
          isActive: printer.isActive,
        });
      } else {
        reset({
          name: "",
          ip: "192.168.1.200",
          port: 9100,
          role: "kitchen",
          isActive: true,
        });
      }
    }
  }, [open, printer, reset]);

  const onFormSubmit = async (values: PrinterFormValues) => {
    setErrorMessage(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Failed to save printer");
      setErrorMessage(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {printer ? `Edit ${printer.name}` : "Add Network Thermal Printer"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure direct TCP/IP RAW socket printing (ESC/POS)
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
            <Label htmlFor="printer-name" className="text-sm font-semibold text-gray-700">
              Printer Name *
            </Label>
            <Input
              id="printer-name"
              placeholder="e.g. Kitchen Grill / Cashier Counter"
              {...register("name")}
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-red-600 font-medium">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="printer-ip" className="text-sm font-semibold text-gray-700">
                IP Address *
              </Label>
              <Input
                id="printer-ip"
                placeholder="192.168.1.200"
                {...register("ip")}
              />
              {errors.ip && (
                <p className="text-xs text-red-600 font-medium">{errors.ip.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="printer-port" className="text-sm font-semibold text-gray-700">
                Port *
              </Label>
              <Input
                id="printer-port"
                type="number"
                placeholder="9100"
                {...register("port")}
              />
              {errors.port && (
                <p className="text-xs text-red-600 font-medium">{errors.port.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Printer Role *
            </Label>
            <Select
              value={watchRole}
              onValueChange={(val) => setValue("role", val as PrinterRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kitchen">Kitchen Printer (Order Slips)</SelectItem>
                <SelectItem value="cashier">Cashier Printer (Bill Slips)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {watchRole === "cashier"
                ? "Used to print customer receipt bills at payment time."
                : "Used to route kitchen preparation slips for assigned categories."}
            </p>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-gray-50/50">
            <div>
              <Label className="text-sm font-semibold text-gray-800">
                Printer Active
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enable this device for live slip dispatching
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
              ) : printer ? (
                "Save Changes"
              ) : (
                "Add Printer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

