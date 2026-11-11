"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCartStore } from "@/store";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ServiceWorkerRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const drafts = useCartStore((s) => s.drafts);

  useEffect(() => {
    // Only register in production and secure contexts (or localhost)
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const isSecure = window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!isSecure) return; // Fail silently on plain HTTP LAN

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Check if there is already a waiting worker
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker);
              }
            });
          }
        });
      })
      .catch(() => {
        // Silent graceful degradation
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  useEffect(() => {
    if (!waitingWorker) return;

    // Do NOT prompt / reload if cart has unsent items
    const hasUnsentDraft = Object.values(drafts).some((d) => d.items.length > 0);
    if (hasUnsentDraft) {
      console.log("Postponing PWA update reload because cart has unsent draft items.");
      return;
    }

    toast("New version available", {
      description: "An update for Resto POS is ready to install.",
      duration: Infinity,
      id: "pwa-update-toast",
      action: {
        label: "Reload App",
        onClick: () => {
          waitingWorker.postMessage({ action: "skipWaiting" });
        },
      },
    });
  }, [waitingWorker, drafts]);

  return null;
}
