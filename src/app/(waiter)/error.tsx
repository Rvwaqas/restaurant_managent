"use client";

import React from "react";
import { ErrorView } from "@/components/common/error-view";

export default function WaiterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[500px] flex items-center justify-center p-6">
      <ErrorView
        title="Floor Service Interrupted"
        message="Failed to load table orders. Cart drafts on this tablet are safe. Please retry."
        error={error}
        reset={reset}
        homeHref="/floor-1"
      />
    </div>
  );
}

