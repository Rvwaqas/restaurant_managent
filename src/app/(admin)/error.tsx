"use client";

import React from "react";
import { ErrorView } from "@/components/common/error-view";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[500px] flex items-center justify-center p-6">
      <ErrorView
        title="Admin Module Error"
        message="Failed to load management data. Please try again or return to the overview."
        error={error}
        reset={reset}
        homeHref="/admin"
      />
    </div>
  );
}

