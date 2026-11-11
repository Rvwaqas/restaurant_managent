"use client";

import React from "react";
import { ErrorView } from "@/components/common/error-view";
import "@/app/globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F5F6FA] text-[#111827] flex items-center justify-center p-6 antialiased">
        <ErrorView
          title="Terminal System Error"
          message="A critical error interrupted the POS application shell."
          error={error}
          reset={reset}
          homeHref="/"
        />
      </body>
    </html>
  );
}

