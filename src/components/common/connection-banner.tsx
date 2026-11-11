"use client";

import React from "react";
import { useConnectionStore } from "@/store";
import { WifiOff, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);

  if (status === "online") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full py-1.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 select-none z-50 transition-colors",
        status === "offline"
          ? "bg-gray-900 text-white border-b border-gray-800"
          : "bg-amber-100 text-amber-900 border-b border-amber-200"
      )}
    >
      {status === "offline" ? (
        <>
          <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse flex-shrink-0" />
          <span>
            You are offline. Orders cannot be sent until connection returns. Cart drafts remain safe.
          </span>
        </>
      ) : (
        <>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
          <span>Network connection is unstable. System is automatically retrying requests.</span>
        </>
      )}
    </div>
  );
}

export function ConnectionPill() {
  const status = useConnectionStore((s) => s.status);

  if (status === "online") {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold select-none",
        status === "offline"
          ? "bg-gray-900 text-white"
          : "bg-amber-100 text-amber-900 border border-amber-200"
      )}
      title={status === "offline" ? "Device offline" : "Unstable connection"}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          status === "offline" ? "bg-amber-400 animate-ping" : "bg-amber-500"
        )}
      />
      <span className="capitalize">{status}</span>
    </div>
  );
}

