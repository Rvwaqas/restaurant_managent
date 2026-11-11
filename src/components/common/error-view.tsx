"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ErrorViewProps {
  title?: string;
  message?: string;
  error?: Error & { digest?: string };
  reset?: () => void;
  homeHref?: string;
}

export function ErrorView({
  title = "Something went wrong",
  message = "An unexpected error occurred while loading this screen. Please try again.",
  error,
  reset,
  homeHref = "/",
}: ErrorViewProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleCopyDetails = async () => {
    const details = [
      `Timestamp: ${new Date().toISOString()}`,
      `URL: ${typeof window !== "undefined" ? window.location.href : "SSR"}`,
      `Digest: ${error?.digest || "N/A"}`,
      `Message: ${error?.message || message}`,
      `Stack: ${error?.stack || "No stack trace available"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-full max-w-md bg-white rounded-2xl border border-border p-6 shadow-sm space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {error?.message && error.message !== "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive information. A digest was provided to be used with the server logs."
              ? error.message
              : message}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-1">
          {reset && (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => reset()}
              className="flex-1 font-semibold"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              <span>Retry</span>
            </Button>
          )}

          <Link href={homeHref} className="flex-1">
            <Button
              type="button"
              variant="outline"
              size="md"
              fullWidth
              className="font-semibold"
            >
              <Home className="w-4 h-4 mr-1.5" />
              <span>Home</span>
            </Button>
          </Link>
        </div>

        {/* Collapsed Technical Details */}
        <div className="pt-2 border-t border-border text-left">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between text-[11px] text-gray-500 hover:text-gray-900 py-1 font-medium transition-colors"
          >
            <span>Technical details</span>
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDetails && (
            <div className="mt-2 p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-200 text-[11px]">
              {error?.digest && (
                <div>
                  <span className="text-gray-500 font-medium">Error Digest:</span>{" "}
                  <code className="text-gray-800 font-mono text-[10px] bg-white px-1 py-0.5 rounded border border-gray-200">
                    {error.digest}
                  </code>
                </div>
              )}
              <div className="max-h-24 overflow-y-auto font-mono text-[10px] text-gray-600 break-all select-text">
                {error?.message || "No specific message provided."}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyDetails}
                className="min-h-[32px] h-8 px-2.5 text-[11px] border-border bg-white text-gray-700 w-full justify-center"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-primary" />
                    <span>Copied Details</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    <span>Copy Error Details</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default ErrorView;

