import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Error state display when an API query or WiFi network sync fails.
 */
export function ErrorState({
  title = "Something went wrong",
  message = "Failed to load data from local server. Please check your WiFi connection.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-red-50/50 rounded-2xl border-2 border-red-200 select-none",
        className
      )}
    >
      <div className="w-16 h-16 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-bold text-red-950 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-red-800/80 mt-1.5 max-w-sm">
        {message}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onRetry}
            className="border-red-300 text-red-900 hover:bg-red-100"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            <span>Try Again</span>
          </Button>
        </div>
      )}
    </div>
  );
}

