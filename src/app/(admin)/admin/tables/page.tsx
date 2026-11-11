"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FloorSwitcher } from "@/components/admin/floor-switcher";
import { TableFormDialog } from "@/components/admin/table-form-dialog";
import { BulkTableDialog } from "@/components/admin/bulk-table-dialog";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { InlineSwitch } from "@/components/admin/inline-switch";
import { useTablesStore } from "@/store";
import { formatMoney } from "@/utils/money";
import type { Table, BulkCreateTablesPayload } from "@/types";
import {
  TableIcon as TableBar,
  Plus,
  Sparkles,
  Users,
  Edit2,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function AdminTablesPage() {
  const [floorId, setFloorId] = useState<string>("f1");
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    table: Table | null;
  }>({
    open: false,
    table: null,
  });

  const {
    fetchFloor,
    tablesForFloor,
    createTable,
    updateTable,
    deleteTable,
    bulkCreateTables,
    counts,
  } = useTablesStore();

  const loadTables = useCallback(
    async (fId: string, silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        await fetchFloor(fId, { silent });
      } catch (err: unknown) {
        if (!silent) {
          toast.error(err instanceof Error ? err.message : "Failed to load tables");
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [fetchFloor]
  );

  useEffect(() => {
    loadTables(floorId);
    // 10s silent poll for live table status updates
    const interval = setInterval(() => {
      loadTables(floorId, true);
    }, 10000);
    return () => clearInterval(interval);
  }, [floorId, loadTables]);

  const tables = tablesForFloor(floorId);
  const floorCounts = counts(floorId);

  // Stats calculation
  const stats = useMemo(() => {
    const total = tables.length;
    const active = tables.filter((t) => t.isActive !== false).length;
    const occupied = tables.filter((t) => t.status === "occupied").length;
    const free = active - occupied;
    return { total, active, occupied, free };
  }, [tables]);

  // Actions
  const handleSaveSingleTable = async (values: {
    number: number;
    capacity: number;
    isActive: boolean;
  }) => {
    if (editingTable) {
      await updateTable(editingTable.id, values);
      toast.success(`Table T-${values.number} updated`);
    } else {
      await createTable({
        floorId,
        number: values.number,
        capacity: values.capacity,
        status: "free",
        isActive: values.isActive,
      });
      toast.success(`Table T-${values.number} created`);
    }
  };

  const handleBulkSubmit = async (payload: BulkCreateTablesPayload) => {
    const res = await bulkCreateTables(floorId, payload);
    toast.success(
      `Created ${res.created.length} new tables${
        res.skippedNumbers.length > 0
          ? ` (${res.skippedNumbers.length} existing skipped)`
          : ""
      }`
    );
  };

  const handleCapacityStep = async (table: Table, delta: number) => {
    const newCap = Math.max(1, Math.min(50, table.capacity + delta));
    if (newCap === table.capacity) return;
    try {
      await updateTable(table.id, { capacity: newCap });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change capacity");
    }
  };

  const handleToggleActive = async (table: Table, isActive: boolean) => {
    await updateTable(table.id, { isActive });
    toast.success(`Table T-${table.number} is now ${isActive ? "Active" : "Hidden"}`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.table) return;
    const res = await deleteTable(deleteDialog.table.id, floorId);
    if (res.softDeleted) {
      toast.info(`Table T-${deleteDialog.table.number} has order history; marked inactive.`);
    } else {
      toast.success(`Table T-${deleteDialog.table.number} deleted.`);
    }
  };

  return (
    <RoleGuard roles={["admin"]}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <AdminPageHeader
          title="Table Management"
          description="Configure tables, seating capacity, and floor occupancy for tablets."
          actions={
            <div className="flex items-center gap-3">
              <FloorSwitcher
                currentFloorId={floorId}
                onFloorChange={(id) => setFloorId(id)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadTables(floorId)}
                className="h-11 px-3 rounded-xl border-border bg-white"
                title="Refresh table status"
              >
                <RefreshCw className="w-4 h-4 text-gray-600" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setBulkDialogOpen(true)}
                className="h-11 px-4 rounded-xl border-border bg-white text-sm font-semibold"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-primary" />
                Bulk Add Range
              </Button>
              <Button
                onClick={() => {
                  setEditingTable(null);
                  setSingleDialogOpen(true);
                }}
                className="h-11 px-4 rounded-xl font-semibold bg-primary hover:bg-primary-hover text-white"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Table
              </Button>
            </div>
          }
        />

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-border shadow-sm p-4 bg-white">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Total Tables
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {stats.total}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {stats.active} active in system
            </div>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm p-4 bg-white">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Free Tables
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-1 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              {stats.free}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Ready for guests
            </div>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm p-4 bg-white">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Occupied Right Now
            </div>
            <div className="text-2xl font-bold text-rose-600 mt-1 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
              {stats.occupied}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Active open orders
            </div>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm p-4 bg-white">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Floor Seating
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-1.5">
              <Users className="w-5 h-5 text-gray-400" />
              {tables.reduce((sum, t) => sum + (t.isActive !== false ? t.capacity : 0), 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Total guest capacity
            </div>
          </Card>
        </div>

        {/* Tables Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <span className="text-sm font-semibold">Loading tables...</span>
          </div>
        ) : tables.length === 0 ? (
          <div className="text-center py-16 bg-white border-2 border-dashed border-border rounded-2xl p-6">
            <TableBar className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-bold text-gray-900">No tables configured</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">
              Add individual tables or generate a numbered range (e.g. 1 to 20) for this floor.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => setBulkDialogOpen(true)}
                className="rounded-xl h-11 px-4 text-sm font-semibold"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-primary" />
                Bulk Add Range
              </Button>
              <Button
                onClick={() => {
                  setEditingTable(null);
                  setSingleDialogOpen(true);
                }}
                className="rounded-xl h-11 px-5 text-sm font-semibold bg-primary hover:bg-primary-hover text-white"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Single Table
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {tables.map((table) => {
              const isOccupied = table.status === "occupied";
              const isInactive = table.isActive === false;

              return (
                <Card
                  key={table.id}
                  className={`rounded-2xl border transition-all select-none p-4 flex flex-col justify-between ${
                    isInactive
                      ? "opacity-60 bg-gray-50 border-dashed border-gray-300"
                      : isOccupied
                      ? "bg-rose-50/30 border-rose-200 shadow-sm"
                      : "bg-white border-border hover:border-gray-300 shadow-sm"
                  }`}
                >
                  <div>
                    {/* Top Header: Table Number & Status Dot */}
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="text-2xl font-black text-gray-900 tracking-tight">
                          T-{table.number}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isOccupied ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                            }`}
                          />
                          <span
                            className={`text-xs font-bold uppercase tracking-wider ${
                              isOccupied ? "text-rose-700" : "text-emerald-700"
                            }`}
                          >
                            {isOccupied ? "Occupied" : "Free"}
                          </span>
                        </div>
                      </div>

                      {/* Running total if occupied */}
                      {isOccupied && table.runningTotal !== undefined && (
                        <div className="text-right">
                          <span className="text-[10px] font-semibold text-muted-foreground block">
                            Bill
                          </span>
                          <span className="text-xs font-mono font-bold text-rose-700 tabular-nums">
                            {formatMoney(table.runningTotal)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Inline Capacity Stepper */}
                    <div className="mt-4 pt-3 border-t border-border/80 flex items-center justify-between">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        Seats:
                      </span>
                      <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => handleCapacityStep(table, -1)}
                          disabled={table.capacity <= 1}
                          className="w-6 h-6 rounded-md bg-white text-gray-700 font-bold text-xs flex items-center justify-center hover:bg-gray-200 disabled:opacity-40"
                          title="Decrease seats"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold text-xs px-1 tabular-nums">
                          {table.capacity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCapacityStep(table, 1)}
                          disabled={table.capacity >= 50}
                          className="w-6 h-6 rounded-md bg-white text-gray-700 font-bold text-xs flex items-center justify-center hover:bg-gray-200 disabled:opacity-40"
                          title="Increase seats"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Active Switch & Actions */}
                  <div className="mt-4 pt-3 border-t border-border/80 flex items-center justify-between">
                    <InlineSwitch
                      checked={table.isActive}
                      onToggle={(nextActive) => handleToggleActive(table, nextActive)}
                      activeLabel="Active"
                      inactiveLabel="Hidden"
                    />

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTable(table);
                          setSingleDialogOpen(true);
                        }}
                        className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-gray-900"
                        title="Edit table"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteDialog({
                            open: true,
                            table,
                          });
                        }}
                        className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                        title="Delete table"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Single Table Dialog */}
        <TableFormDialog
          open={singleDialogOpen}
          onOpenChange={setSingleDialogOpen}
          table={editingTable}
          floorId={floorId}
          onSubmit={handleSaveSingleTable}
        />

        {/* Bulk Table Dialog */}
        <BulkTableDialog
          open={bulkDialogOpen}
          onOpenChange={setBulkDialogOpen}
          floorId={floorId}
          existingTables={tables}
          onSubmit={handleBulkSubmit}
        />

        {/* Delete Dialog */}
        <ConfirmDeleteDialog
          open={deleteDialog.open}
          onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
          title={
            deleteDialog.table
              ? `Delete Table T-${deleteDialog.table.number}?`
              : "Delete Table"
          }
          description="Occupied tables cannot be deleted. If this table has past orders, it will be deactivated to keep historical bills intact."
          itemName={deleteDialog.table ? `Table T-${deleteDialog.table.number}` : undefined}
          isSoftDeleteWarning={true}
          onConfirm={handleConfirmDelete}
        />
      </div>
    </RoleGuard>
  );
}
