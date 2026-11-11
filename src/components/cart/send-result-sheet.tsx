"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, Printer, RotateCw, ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/money";
import { ordersService } from "@/lib/api/services";
import type { SendResult, PrintJob } from "@/types";

export interface SendResultSheetProps {
  open: boolean;
  result: SendResult | null;
  tableNumber: number | string;
  floorSlug: string;
  floorName?: string;
  onClose: () => void;
  onBackToTables: () => void;
  onPreviewSlip: () => void;
}

export function SendResultSheet({
  open,
  result,
  tableNumber,
  floorSlug,
  floorName,
  onClose,
  onBackToTables,
  onPreviewSlip,
}: SendResultSheetProps) {
  const [printJobs, setPrintJobs] = React.useState<PrintJob[]>([]);
  const [retryingCategory, setRetryingCategory] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (result) {
      setPrintJobs(result.printJobs || []);
    }
  }, [result]);

  if (!open || !result) return null;

  const handleRetryPrint = async (job: PrintJob) => {
    setRetryingCategory(job.categoryId);
    try {
      const updatedJob = await ordersService.reprint(
        result.order.id,
        result.batchNo,
        job.categoryId
      );
      setPrintJobs((prev) =>
        prev.map((pj) =>
          pj.categoryId === job.categoryId ? updatedJob : pj
        )
      );
    } catch (err) {
      console.error("Retry print failed", err);
    } finally {
      setRetryingCategory(null);
    }
  };

  const hasFailures = printJobs.some((pj) => pj.status === "failed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex flex-col bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-border select-none">
        {/* Header Banner */}
        <div className="p-6 bg-indigo-50/70 border-b border-indigo-100 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shrink-0 shadow-md">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              {floorName || floorSlug.toUpperCase()} &bull; TABLE {tableNumber}
            </span>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Batch #{result.batchNo} Sent!
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Order updated. Current total:{" "}
              <span className="font-extrabold text-gray-900 tabular-nums">
                {formatMoney(result.order.total)}
              </span>
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Print Jobs Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase text-gray-500 tracking-wider">
                Kitchen Network Printers
              </h4>
              <button
                type="button"
                onClick={onPreviewSlip}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Preview KOT Slip</span>
              </button>
            </div>

            <div className="space-y-2">
              {printJobs.map((job) => {
                const isFailed = job.status === "failed";
                const isRetrying = retryingCategory === job.categoryId;

                return (
                  <div
                    key={job.categoryId}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                      isFailed
                        ? "bg-amber-50 border-amber-200 text-amber-950"
                        : "bg-gray-50 border-border text-gray-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isFailed
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {isFailed ? (
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                        ) : (
                          <Printer className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-sm leading-tight">
                          {job.categoryName} Station
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {job.printerName}
                          {job.error && (
                            <span className="text-amber-700 font-medium ml-1">
                              &bull; {job.error}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isFailed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetryPrint(job)}
                          disabled={isRetrying}
                          className="font-bold border-amber-300 text-amber-800 hover:bg-amber-100 gap-1.5"
                        >
                          <RotateCw
                            className={`w-3.5 h-3.5 ${
                              isRetrying ? "animate-spin" : ""
                            }`}
                          />
                          <span>Retry</span>
                        </Button>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-200 text-gray-800">
                          Printed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasFailures && (
              <p className="text-xs text-amber-800 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200 font-medium">
                One or more slips could not reach the kitchen printer. You can tap
                Retry or preview and print manually.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t border-border grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onBackToTables}
            className="font-bold text-gray-800 border-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            <span>Back to Tables</span>
          </Button>

          <Button
            variant="primary"
            size="lg"
            onClick={onClose}
            className="font-bold shadow-md"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Add More Items</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
