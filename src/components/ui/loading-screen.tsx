import * as React from "react";
import { UtensilsCrossed, Loader2 } from "lucide-react";
import { APP_NAME } from "@/config/app";

export interface LoadingScreenProps {
  message?: string;
}

/**
 * Fullscreen or container loading screen with app branding.
 * Shown during hydration or session verification to prevent screen flashes.
 */
export function LoadingScreen({ message = "Loading POS terminal..." }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg ring-4 ring-primary/20 animate-pulse">
          <UtensilsCrossed className="w-8 h-8" />
        </div>

        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
            {APP_NAME}
          </h2>
          <div className="flex items-center justify-center gap-2 mt-2 text-sm text-muted-foreground font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>{message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

