"use client";

import * as React from "react";
import {
  Receipt,
  RotateCw,
  Search,
  Calendar,
  Filter,
  Printer,
  DollarSign,
  CreditCard,
  Banknote,
  Smartphone,
  Eye,
  CheckCircle2,
} from "lucide-react";
import type { Order, PaymentMethod } from "@/types";
import { useBillsStore, useFloorsStore, useTablesStore } from "@/store";
import { RoleGuard } from "@/components/auth/role-guard";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { BillSlipModal } from "@/components/slips/bill-slip-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/use-toast";
import { formatMoney } from "@/utils/money";

export default function AdminBillsPage() {
  const { toast } = useToast();
  const {
    bills,
    total,
    totalAmount,
    filters,
    status,
    fetchBills,
    setFilters,
    reprintBill,
  } = useBillsStore();

  const { floors, fetchFloors } = useFloorsStore();
  const { items: tablesByFloor } = useTablesStore();

  // Selected bill for viewing/printing
  const [selectedBill, setSelectedBill] = React.useState<Order | null>(null);
  const [reprintingId, setReprintingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchFloors();
    fetchBills();
  }, [fetchFloors, fetchBills]);

  // Lookup helper for floor name
  const getFloorName = (floorId: string) => {
    return floors.find((f) => f.id === floorId)?.name || floorId;
  };

  // Lookup helper for table number
  const getTableNumber = (floorId: string, tableId: string) => {
    const list = tablesByFloor[floorId] || [];
    const t = list.find((tbl) => tbl.id === tableId);
    if (t) return t.number;
    const match = tableId.match(/t(\d+)/i);
    return match ? match[1] : tableId;
  };

  const handleReprint = async (bill: Order) => {
    setReprintingId(bill.id);
    try {
      const job = await reprintBill(bill.id);
      if (job.status === "failed") {
        toast({
          variant: "destructive",
          title: "Cashier Printer Offline",
          description: job.error || "Failed to print bill slip. Check printer paper/network.",
        });
      } else {
        toast({
          title: "Slip Reprinted",
          description: `Bill ${bill.billNo || bill.id} dispatched to ${job.printerName}.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Reprint failed";
      toast({
        variant: "destructive",
        title: "Print Error",
        description: msg,
      });
    } finally {
      setReprintingId(null);
    }
  };

  // KPI calculations
  const cashTotal = React.useMemo(() => {
    return bills
      .filter((b) => b.paymentMethod === "cash")
      .reduce((s, b) => s + b.total, 0);
  }, [bills]);

  const cardOnlineTotal = React.useMemo(() => {
    return bills
      .filter((b) => b.paymentMethod === "card" || b.paymentMethod === "online")
      .reduce((s, b) => s + b.total, 0);
  }, [bills]);

  // Columns for DataTable
  const columns: ColumnDef<Order>[] = [
    {
      header: "Bill No",
      cell: (bill) => (
        <span className="font-mono font-black text-sm text-gray-900">
          {bill.billNo || "B-0001"}
        </span>
      ),
    },
    {
      header: "Date & Time",
      cell: (bill) => {
        const d = bill.paidAt ? new Date(bill.paidAt) : new Date(bill.createdAt);
        return (
          <div className="text-xs">
            <div className="font-semibold text-gray-800">
              {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {d.toLocaleDateString()}
            </div>
          </div>
        );
      },
    },
    {
      header: "Floor & Table",
      cell: (bill) => (
        <div className="text-xs">
          <span className="font-extrabold text-gray-900 block font-mono">
            Table #{getTableNumber(bill.floorId, bill.tableId)}
          </span>
          <span className="text-muted-foreground text-[11px]">
            {getFloorName(bill.floorId)}
          </span>
        </div>
      ),
    },
    {
      header: "Method",
      cell: (bill) => {
        const m = bill.paymentMethod || "cash";
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              m === "cash"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : m === "card"
                ? "bg-indigo-50 text-primary border border-indigo-200"
                : "bg-purple-50 text-purple-800 border border-purple-200"
            }`}
          >
            {m === "cash" && <Banknote className="w-3.5 h-3.5" />}
            {m === "card" && <CreditCard className="w-3.5 h-3.5" />}
            {m === "online" && <Smartphone className="w-3.5 h-3.5" />}
            <span>{m}</span>
          </span>
        );
      },
    },
    {
      header: "Total",
      cell: (bill) => (
        <span className="text-base font-extrabold text-gray-900 tabular-nums">
          {formatMoney(bill.total)}
        </span>
      ),
    },
    {
      header: "Actions",
      cell: (bill) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedBill(bill)}
            className="font-bold text-xs gap-1 hover:bg-gray-100"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={reprintingId === bill.id}
            onClick={() => handleReprint(bill)}
            className="font-bold text-xs gap-1 border-gray-300 hover:bg-gray-100"
          >
            <Printer
              className={`w-3.5 h-3.5 ${
                reprintingId === bill.id ? "animate-spin text-primary" : ""
              }`}
            />
            <span>Reprint</span>
          </Button>
        </div>
      ),
    },
  ];

  // Bill items for slip preview modal
  const selectedBillItems = React.useMemo(() => {
    if (!selectedBill) return [];
    const active = (selectedBill.items || []).filter((i) => !i.voided);
    const map = new Map<string, { name: string; qty: number; price: number }>();

    for (const item of active) {
      const existing = map.get(item.name);
      if (existing) {
        existing.qty += item.qty;
      } else {
        map.set(item.name, {
          name: item.name,
          qty: item.qty,
          price: item.price,
        });
      }
    }
    return Array.from(map.values());
  }, [selectedBill]);

  return (
    <RoleGuard roles={["admin"]}>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 select-none max-w-7xl mx-auto w-full">
        {/* Header */}
        <PageHeader
          title="Paid Bills & Cashier Receipts"
          description="Review settlement logs, reprint cashier receipts, and audit daily sales across floors."
          action={
            <Button
              variant="outline"
              size="md"
              onClick={() => fetchBills()}
              disabled={status === "loading"}
              className="font-bold gap-2"
            >
              <RotateCw
                className={`w-4 h-4 ${status === "loading" ? "animate-spin text-primary" : ""}`}
              />
              <span>Refresh</span>
            </Button>
          }
        />

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white border-2 border-border shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Total Bills
              </span>
              <div className="text-2xl sm:text-3xl font-black text-gray-900 tabular-nums mt-0.5">
                {total}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border-2 border-border shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Total Revenue
              </span>
              <div className="text-2xl sm:text-3xl font-black text-primary tabular-nums mt-0.5">
                {formatMoney(totalAmount)}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-primary shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border-2 border-border shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Cash Settle
              </span>
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 tabular-nums mt-0.5">
                {formatMoney(cashTotal)}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border-2 border-border shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Card & QR
              </span>
              <div className="text-2xl sm:text-3xl font-black text-gray-900 tabular-nums mt-0.5">
                {formatMoney(cardOnlineTotal)}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-white rounded-2xl border-2 border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search */}
            <SearchInput
              value={filters.search || ""}
              onChange={(val) => setFilters({ search: val })}
              placeholder="Search by Bill # or Table..."
              className="max-w-xs"
            />

            {/* Date filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-gray-50 text-xs font-bold text-gray-700">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={filters.date || ""}
                onChange={(e) => setFilters({ date: e.target.value || undefined })}
                className="bg-transparent focus:outline-none cursor-pointer"
              />
              {filters.date && (
                <button
                  type="button"
                  onClick={() => setFilters({ date: undefined })}
                  className="ml-1 text-gray-400 hover:text-gray-700 text-xs"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Floor filter */}
            <select
              value={filters.floorId || "all"}
              onChange={(e) =>
                setFilters({
                  floorId: e.target.value === "all" ? undefined : e.target.value,
                })
              }
              className="h-10 px-3 rounded-xl border border-border bg-white text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Floors</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            {/* Method filter */}
            <select
              value={filters.paymentMethod || "all"}
              onChange={(e) =>
                setFilters({
                  paymentMethod:
                    e.target.value === "all"
                      ? undefined
                      : (e.target.value as PaymentMethod),
                })
              }
              className="h-10 px-3 rounded-xl border border-border bg-white text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash Only</option>
              <option value="card">Card Only</option>
              <option value="online">Online / QR Only</option>
            </select>
          </div>

          {(filters.search || filters.floorId || filters.paymentMethod || filters.date) && (
            <button
              type="button"
              onClick={() =>
                setFilters({
                  search: undefined,
                  floorId: undefined,
                  paymentMethod: undefined,
                  date: undefined,
                })
              }
              className="text-xs font-extrabold text-primary hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Data Table */}
        {bills.length === 0 ? (
          <EmptyState
            title="No paid bills found"
            description="No orders match your filter criteria. Try resetting the filters or check another date."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFilters({
                    search: undefined,
                    floorId: undefined,
                    paymentMethod: undefined,
                    date: undefined,
                  })
                }
                className="font-bold"
              >
                Reset Filters
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={bills}
            keyExtractor={(b) => b.id}
            pageSize={10}
          />
        )}

        {/* Receipt Slip Preview Modal */}
        {selectedBill && (
          <BillSlipModal
            open={Boolean(selectedBill)}
            onClose={() => setSelectedBill(null)}
            tableNumber={getTableNumber(selectedBill.floorId, selectedBill.tableId)}
            floorName={getFloorName(selectedBill.floorId)}
            billNo={selectedBill.billNo || "B-0001"}
            waiterName="Staff"
            timestamp={selectedBill.paidAt || selectedBill.createdAt}
            items={selectedBillItems}
            subtotal={selectedBill.subtotal}
            serviceCharge={selectedBill.serviceCharge}
            tax={selectedBill.tax}
            discount={selectedBill.discount}
            total={selectedBill.total}
            paymentMethod={selectedBill.paymentMethod}
            amountReceived={selectedBill.amountReceived}
            changeDue={selectedBill.changeDue}
          />
        )}
      </div>
    </RoleGuard>
  );
}
