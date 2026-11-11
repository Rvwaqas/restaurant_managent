"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tablesService, floorsService } from "@/lib/api/services";
import { PageHeader } from "@/components/ui/page-header";
import type { Table } from "@/types";

export default function DevTablesSimulatorPage() {
  const [lastAction, setLastAction] = useState<string>("No simulation performed yet.");
  const [isLoading, setIsLoading] = useState(false);

  // Simulate another tablet sending an order -> turns a free table to occupied
  const handleSimulateOccupied = async (floorId = "f1") => {
    setIsLoading(true);
    try {
      const tables = await tablesService.listByFloor(floorId);
      const freeTables = tables.filter((t) => t.status === "free");

      if (freeTables.length === 0) {
        setLastAction(`All tables on ${floorId} are already occupied!`);
        setIsLoading(false);
        return;
      }

      const randomTable = freeTables[Math.floor(Math.random() * freeTables.length)];
      await tablesService.updateStatus(randomTable.id, "occupied");

      setLastAction(
        `[SIMULATION SUCCESS] Another tablet placed an order on Table ${randomTable.number} (${floorId}). Table status changed to OCCUPIED. Go to the floor view and watch it update within 5 seconds with a pulse highlight!`
      );
    } catch (err: unknown) {
      setLastAction(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate cashier paying a bill -> turns an occupied table to free
  const handleSimulateFree = async (floorId = "f1") => {
    setIsLoading(true);
    try {
      const tables = await tablesService.listByFloor(floorId);
      const occupiedTables = tables.filter((t) => t.status === "occupied");

      if (occupiedTables.length === 0) {
        setLastAction(`No occupied tables on ${floorId} to free!`);
        setIsLoading(false);
        return;
      }

      const randomTable = occupiedTables[Math.floor(Math.random() * occupiedTables.length)];
      await tablesService.updateStatus(randomTable.id, "free");

      setLastAction(
        `[SIMULATION SUCCESS] Cashier closed bill on Table ${randomTable.number} (${floorId}). Table status changed to FREE. Check the floor view within 5 seconds!`
      );
    } catch (err: unknown) {
      setLastAction(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto space-y-6 select-none">
      <div className="flex items-center justify-between">
        <Link href="/dev/api-check">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span>Back to Diagnostics</span>
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/floor-1">
            <Button variant="primary" size="sm">
              Open Floor 1
            </Button>
          </Link>
          <Link href="/floor-2">
            <Button variant="secondary" size="sm">
              Open Floor 2
            </Button>
          </Link>
        </div>
      </div>

      <PageHeader
        title="Multi-Tablet Real-Time Sync Simulator"
        subtitle="Simulate actions taken on another tablet (orders sent, bills paid) to test 5-second polling synchronization."
      />

      <div className="bg-white rounded-3xl border-2 border-border p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="space-y-4">
          <h3 className="text-base font-extrabold text-gray-900">
            Simulate Activity on Floor 1 (Halal)
          </h3>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              size="lg"
              loading={isLoading}
              onClick={() => handleSimulateOccupied("f1")}
              className="font-bold shadow-sm"
            >
              <Clock className="w-5 h-5 mr-2" />
              <span>Mark Random Floor 1 Table OCCUPIED</span>
            </Button>

            <Button
              variant="secondary"
              size="lg"
              loading={isLoading}
              onClick={() => handleSimulateFree("f1")}
              className="font-bold border-2 border-border"
            >
              <CheckCircle2 className="w-5 h-5 mr-2 text-green-600" />
              <span>Mark Random Floor 1 Table FREE</span>
            </Button>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-base font-extrabold text-gray-900">
            Simulate Activity on Floor 2 (Non-Halal)
          </h3>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              size="lg"
              loading={isLoading}
              onClick={() => handleSimulateOccupied("f2")}
              className="font-bold shadow-sm"
            >
              <Clock className="w-5 h-5 mr-2" />
              <span>Mark Random Floor 2 Table OCCUPIED</span>
            </Button>

            <Button
              variant="secondary"
              size="lg"
              loading={isLoading}
              onClick={() => handleSimulateFree("f2")}
              className="font-bold border-2 border-border"
            >
              <CheckCircle2 className="w-5 h-5 mr-2 text-green-600" />
              <span>Mark Random Floor 2 Table FREE</span>
            </Button>
          </div>
        </div>

        {/* Live Simulation Output Box */}
        <div className="p-4 rounded-2xl bg-gray-50 border border-border space-y-2">
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Simulator Log Output:
          </span>
          <div className="font-mono text-xs sm:text-sm text-gray-800 break-words font-semibold">
            {lastAction}
          </div>
        </div>
      </div>
    </div>
  );
}

