"use client";

import { useEffect } from "react";
import { initRealtime } from "@/lib/realtime";

export function RealtimeInitializer() {
  useEffect(() => {
    const cleanup = initRealtime();
    return cleanup;
  }, []);

  return null;
}

