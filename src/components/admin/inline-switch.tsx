"use client";

import React, { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface InlineSwitchProps {
  checked: boolean;
  onToggle: (checked: boolean) => Promise<void>;
  disabled?: boolean;
  label?: string;
  className?: string;
  activeLabel?: string;
  inactiveLabel?: string;
}

export function InlineSwitch({
  checked,
  onToggle,
  disabled = false,
  label,
  className,
  activeLabel,
  inactiveLabel,
}: InlineSwitchProps) {
  const [internalChecked, setInternalChecked] = useState(checked);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setInternalChecked(checked);
  }, [checked]);

  const handleChange = async (nextChecked: boolean) => {
    const previous = internalChecked;
    setInternalChecked(nextChecked);
    setIsPending(true);

    try {
      await onToggle(nextChecked);
    } catch (err: unknown) {
      // Rollback
      setInternalChecked(previous);
      const msg = err instanceof Error ? err.message : "Failed to update status";
      toast.error(msg);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 select-none ${className || ""}`}>
      <div className="relative inline-flex items-center">
        <Switch
          checked={internalChecked}
          onCheckedChange={handleChange}
          disabled={disabled || isPending}
        />
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-full">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        )}
      </div>
      {(label || activeLabel || inactiveLabel) && (
        <span className="text-xs font-semibold text-gray-700">
          {label ?? (internalChecked ? activeLabel : inactiveLabel)}
        </span>
      )}
    </div>
  );
}

