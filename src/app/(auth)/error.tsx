"use client";

import React from "react";
import { ErrorView } from "@/components/common/error-view";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="w-full flex items-center justify-center py-12">
      <ErrorView
        title="Authentication Error"
        message="Unable to complete sign-in. Please verify your credentials and try again."
        error={error}
        reset={reset}
        homeHref="/login"
      />
    </div>
  );
}

