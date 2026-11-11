"use client";

import React from "react";
import { WifiOff, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { APP_NAME } from "@/config/app";

export default function OfflineFallbackPage() {
  const handleRetry = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-md bg-white rounded-3xl border border-border p-8 shadow-sm text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <WifiOff className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            {APP_NAME}
          </span>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Cannot Reach Server
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tablet lost connection to the restaurant local network. Please check the Wi-Fi and tap retry once reconnected.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleRetry}
            className="font-bold min-h-[48px]"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            <span>Retry Connection</span>
          </Button>

          <Link href="/floor-1" className="flex-1">
            <Button
              type="button"
              variant="outline"
              size="lg"
              fullWidth
              className="font-bold min-h-[48px]"
            >
              <Home className="w-4 h-4 mr-2" />
              <span>Offline Floor</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

