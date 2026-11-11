"use client";

import React from "react";
import { ErrorView } from "@/components/common/error-view";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <ErrorView
        title="Application Error"
        message="A system error occurred. Please try again or return to the main floor."
        error={error}
        reset={reset}
        homeHref="/"
      />
    </div>
  );
}
