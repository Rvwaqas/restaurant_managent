"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PrinterFormDialog } from "@/components/admin/printer-form-dialog";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { InlineSwitch } from "@/components/admin/inline-switch";
import { usePrintersStore } from "@/store";
import { categoriesService } from "@/lib/api/services";
import { setMockFailedPrinterId, getMockFailedPrinterId } from "@/lib/api/mock/mockControl";
import { env } from "@/config/env";
import type { Printer, Category } from "@/types";
import {
  Printer as PrinterIcon,
  Plus,
  Play,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Server,
  Wifi,
  HelpCircle,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function AdminPrintersPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [simulatedFailurePrinterId, setSimulatedFailurePrinterId] = useState<string | null>(
    getMockFailedPrinterId()
  );

  // Dialog states
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    printer: Printer | null;
  }>({
    open: false,
    printer: null,
  });

  const {
    items: printers,
    statuses,
    isLoading,
    fetchPrinters,
    createPrinter,
    updatePrinter,
    deletePrinter,
    testPrint,
  } = usePrintersStore();

  const loadData = useCallback(async () => {
    try {
      await Promise.all([
        fetchPrinters(),
        categoriesService.list().then(setCategories),
      ]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load printers");
    }
  }, [fetchPrinters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cashier printer analysis
  const cashierPrinters = useMemo(() => {
    return printers.filter((p) => p.role === "cashier" && p.isActive);
  }, [printers]);

  // Category usage map
  const categoriesByPrinter = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const cat of categories) {
      if (cat.isActive !== false) {
        const list = map.get(cat.printerId) || [];
        list.push(cat);
        map.set(cat.printerId, list);
      }
    }
    return map;
  }, [categories]);

  // Actions
  const handleSavePrinter = async (values: {
    name: string;
    ip: string;
    port: number;
    role: "kitchen" | "cashier";
    isActive: boolean;
  }) => {
    if (editingPrinter) {
      await updatePrinter(editingPrinter.id, values);
      toast.success(`Printer "${values.name}" updated`);
    } else {
      await createPrinter(values);
      toast.success(`Printer "${values.name}" added`);
    }
  };

  const handleToggleActive = async (printer: Printer, isActive: boolean) => {
    await updatePrinter(printer.id, { isActive });
    toast.success(`Printer "${printer.name}" is now ${isActive ? "Active" : "Disabled"}`);
  };

  const handleTestPrint = async (printer: Printer) => {
    setTestingPrinterId(printer.id);
    try {
      const res = await testPrint(printer.id);
      if (res.status === "ok") {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send test print");
    } finally {
      setTestingPrinterId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.printer) return;
    await deletePrinter(deleteDialog.printer.id);
    toast.success(`Printer "${deleteDialog.printer.name}" deleted.`);
  };

  const handleToggleSimulatedFailure = (printerId: string) => {
    if (simulatedFailurePrinterId === printerId) {
      setMockFailedPrinterId(null);
      setSimulatedFailurePrinterId(null);
      toast.info("Simulated failure disabled for this printer.");
    } else {
      setMockFailedPrinterId(printerId);
      setSimulatedFailurePrinterId(printerId);
      toast.warning("Simulated failure enabled. Next test print or order to this printer will fail.");
    }
  };

  return (
    <RoleGuard roles={["admin"]}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <AdminPageHeader
          title="Network Thermal Printers"
          description="Direct TCP/IP socket mapping for kitchen category slips and cashier bill printing."
          actions={
            <Button
              onClick={() => {
                setEditingPrinter(null);
                setPrinterDialogOpen(true);
              }}
              className="h-11 px-4 rounded-xl font-semibold bg-primary hover:bg-primary-hover text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Network Printer
            </Button>
          }
        />

        {/* Cashier Printer Validation Banner */}
        {cashierPrinters.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                No Active Cashier Printer Configured
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Customer bill slips cannot be printed at payment time. Please add or enable a printer with the <strong>Cashier</strong> role.
              </p>
            </div>
          </div>
        ) : cashierPrinters.length > 1 ? (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-blue-900">
                Multiple Active Cashier Printers
              </h4>
              <p className="text-xs text-blue-800 mt-0.5">
                The cashier tablet will route payment receipts to the primary device (<strong>{cashierPrinters[0].name}</strong> at {cashierPrinters[0].ip}).
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Cashier printer active: <strong>{cashierPrinters[0].name}</strong> ({cashierPrinters[0].ip}:{cashierPrinters[0].port})
            </span>
          </div>
        )}

        {/* Printers Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <span className="text-sm font-semibold">Loading printers...</span>
          </div>
        ) : printers.length === 0 ? (
          <div className="text-center py-16 bg-white border-2 border-dashed border-border rounded-2xl p-6">
            <PrinterIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-bold text-gray-900">No thermal printers configured</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">
              Add network IP thermal printers (e.g. Epson TM-T88, Star Micronics) for kitchen slips and cashier bills.
            </p>
            <Button
              onClick={() => {
                setEditingPrinter(null);
                setPrinterDialogOpen(true);
              }}
              className="rounded-xl h-11 px-5 text-sm font-semibold bg-primary hover:bg-primary-hover text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add First Printer
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {printers.map((printer) => {
              const assignedCats = categoriesByPrinter.get(printer.id) || [];
              const isSimulatedFail = simulatedFailurePrinterId === printer.id;
              const isTesting = testingPrinterId === printer.id;

              return (
                <Card
                  key={printer.id}
                  className={`rounded-2xl border transition-all p-5 flex flex-col justify-between ${
                    !printer.isActive
                      ? "opacity-60 bg-gray-50 border-dashed border-gray-300"
                      : "bg-white border-border hover:border-gray-300 shadow-sm"
                  }`}
                >
                  <div className="space-y-4">
                    {/* Top Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            printer.role === "cashier"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          <PrinterIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-base text-gray-900">
                            {printer.name}
                          </h3>
                          <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground mt-0.5">
                            <Wifi className="w-3.5 h-3.5 text-gray-400" />
                            <span>{printer.ip}:{printer.port}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {statuses?.[printer.id] && (
                          <Badge
                            variant="outline"
                            className={`text-xs font-bold rounded-lg px-2 py-0.5 capitalize ${
                              statuses[printer.id].state === "ok"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : statuses[printer.id].state === "error"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {statuses[printer.id].state}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-xs font-bold rounded-lg px-2.5 py-1 uppercase tracking-wider ${
                            printer.role === "cashier"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {printer.role}
                        </Badge>
                      </div>
                    </div>

                    {/* Mapped Categories */}
                    <div className="pt-2">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Mapped Categories ({assignedCats.length}):
                      </div>
                      {assignedCats.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No categories assigned yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {assignedCats.map((cat) => (
                            <span
                              key={cat.id}
                              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 font-medium"
                            >
                              {cat.name} ({cat.floorId === "f1" ? "F1" : "F2"})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Dev: Simulated failure toggle (mock mode only) */}
                    {env.devTools && env.useMock && (
                      <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Bug className="w-3.5 h-3.5 text-amber-600" />
                          <span>Simulate network outage</span>
                        </div>
                        <Switch
                          checked={isSimulatedFail}
                          onCheckedChange={() => handleToggleSimulatedFailure(printer.id)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Bottom: Active Toggle & Actions */}
                  <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between">
                    <InlineSwitch
                      checked={printer.isActive}
                      onToggle={(nextActive) => handleToggleActive(printer, nextActive)}
                      activeLabel="Online"
                      inactiveLabel="Disabled"
                    />

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestPrint(printer)}
                        disabled={isTesting || !printer.isActive}
                        className="h-9 px-3 rounded-xl border-border bg-white text-xs font-semibold"
                        title="Send test print slip"
                      >
                        {isTesting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <Play className="w-3.5 h-3.5 mr-1 text-primary" />
                        )}
                        Test Print
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingPrinter(printer);
                          setPrinterDialogOpen(true);
                        }}
                        className="h-9 w-9 p-0 rounded-xl text-gray-500 hover:text-gray-900"
                        title="Edit printer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteDialog({
                            open: true,
                            printer,
                          });
                        }}
                        className="h-9 w-9 p-0 rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50"
                        title="Delete printer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Network Advice Card for Restaurant Operations */}
        <div className="p-5 bg-white border border-border rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <HelpCircle className="w-4 h-4 text-primary" />
            <span>Thermal Printer Network Checklist</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground leading-relaxed">
            <div>
              <strong className="text-gray-800 block mb-0.5">Static IP Addressing</strong>
              Ensure printers have reserved static IPs on the local Wi-Fi router (e.g. 192.168.1.200 to 205) to prevent DHCP shifts mid-service.
            </div>
            <div>
              <strong className="text-gray-800 block mb-0.5">RAW Port 9100</strong>
              Standard thermal ESC/POS network print servers listen on TCP port 9100. Firewall ports should remain open on the LAN.
            </div>
            <div>
              <strong className="text-gray-800 block mb-0.5">Category Isolation</strong>
              Assigning separate kitchen printers to Sweet vs Spicy vs Bar allows kitchen prep stations to receive dedicated paper slips automatically.
            </div>
          </div>
        </div>

        {/* Add/Edit Printer Dialog */}
        <PrinterFormDialog
          open={printerDialogOpen}
          onOpenChange={setPrinterDialogOpen}
          printer={editingPrinter}
          onSubmit={handleSavePrinter}
        />

        {/* Delete Dialog */}
        <ConfirmDeleteDialog
          open={deleteDialog.open}
          onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
          title={
            deleteDialog.printer
              ? `Delete Printer "${deleteDialog.printer.name}"?`
              : "Delete Printer"
          }
          description="A printer cannot be deleted if any active categories are still mapped to it. Reassign those categories first."
          itemName={deleteDialog.printer ? deleteDialog.printer.name : undefined}
          onConfirm={handleConfirmDelete}
        />
      </div>
    </RoleGuard>
  );
}
