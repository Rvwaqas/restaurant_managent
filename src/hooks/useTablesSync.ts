"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { tablesSync } from "@/lib/realtime/tablesSync";
import { useTablesStore } from "@/store";
import { useToast } from "@/components/ui/use-toast";
import type { Table } from "@/types";

export interface UseTablesSyncResult {
  isOnline: boolean;
  isRefreshing: boolean;
  lastUpdated: string | null;
  manualRefresh: () => Promise<void>;
}

export function useTablesSync(floorId: string): UseTablesSyncResult {
  const { toast } = useToast();
  const { setTablesForFloor, fetchFloor, status, lastUpdatedAt } = useTablesStore();

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });

  const failureCountRef = useRef(0);
  const wasOfflineRef = useRef(false);

  // Manual refresh trigger
  const manualRefresh = useCallback(async () => {
    if (!floorId) return;
    try {
      await fetchFloor(floorId, { silent: false });
      failureCountRef.current = 0;
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setIsOnline(true);
        toast({
          title: "WiFi Reconnected",
          description: "Synced latest table orders from local server.",
        });
      }
    } catch {
      failureCountRef.current++;
      if (failureCountRef.current >= 2 && !wasOfflineRef.current) {
        wasOfflineRef.current = true;
        setIsOnline(false);
        toast({
          title: "Connection Lost",
          description: "Showing last saved table data. Reconnecting to WiFi...",
          variant: "destructive",
        });
      }
    }
  }, [floorId, fetchFloor, toast]);

  useEffect(() => {
    if (!floorId) return;

    // Window online/offline events
    const handleOnline = () => {
      failureCountRef.current = 0;
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setIsOnline(true);
        toast({
          title: "WiFi Reconnected",
          description: "Synced latest table orders from local server.",
        });
      }
      manualRefresh();
    };

    const handleOffline = () => {
      if (!wasOfflineRef.current) {
        wasOfflineRef.current = true;
        setIsOnline(false);
        toast({
          title: "Connection Lost",
          description: "Showing last saved table data. Reconnecting to WiFi...",
          variant: "destructive",
        });
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    // Subscribe to real-time polling sync
    const unsubscribe = tablesSync.subscribe(
      floorId,
      (newTables: Table[]) => {
        // Success callback
        setTablesForFloor(floorId, newTables);
        failureCountRef.current = 0;
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false;
          setIsOnline(true);
          toast({
            title: "WiFi Reconnected",
            description: "Synced latest table orders from local server.",
          });
        }
      },
      () => {
        // Error callback
        failureCountRef.current++;
        if (failureCountRef.current >= 2 && !wasOfflineRef.current) {
          wasOfflineRef.current = true;
          setIsOnline(false);
          toast({
            title: "Connection Lost",
            description: "Showing last saved table data. Reconnecting to WiFi...",
            variant: "destructive",
          });
        }
      }
    );

    return () => {
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [floorId, setTablesForFloor, manualRefresh, toast]);

  return {
    isOnline,
    isRefreshing: status === "loading" || status === "refreshing",
    lastUpdated: lastUpdatedAt[floorId] || null,
    manualRefresh,
  };
}

