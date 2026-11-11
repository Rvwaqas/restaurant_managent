"use client";

/**
 * TEMPORARY TEST PAGE: /dev/api-check
 * MARKED FOR DELETION LATER.
 * Verifies that the API service layer and mock adapter correctly handle all endpoints.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  authService,
  floorsService,
  tablesService,
  categoriesService,
  menuItemsService,
  printersService,
  ordersService,
  reportsService,
  usersService,
} from "@/lib/api/services";
import { setMockFailedPrinterId, getMockFailedPrinterId } from "@/lib/api/mock/mockControl";

interface CheckResult {
  service: string;
  endpoint: string;
  status: "pending" | "pass" | "fail";
  data?: unknown;
  error?: string;
}

export default function ApiCheckPage() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [orderFlowResult, setOrderFlowResult] = useState<string>("Not tested yet");
  const [isRunning, setIsRunning] = useState(false);
  const [failedPrinter, setFailedPrinter] = useState<string | null>(getMockFailedPrinterId());

  const handleTogglePrinterFail = (printerId: string | null) => {
    setMockFailedPrinterId(printerId);
    setFailedPrinter(printerId);
  };

  const runChecks = async () => {
    setIsRunning(true);
    const checks: CheckResult[] = [];

    const test = async (service: string, endpoint: string, fn: () => Promise<unknown>) => {
      try {
        const data = await fn();
        checks.push({ service, endpoint, status: "pass", data });
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        checks.push({ service, endpoint, status: "fail", error });
      }
      setResults([...checks]);
    };

    // 1. Auth Service
    await test("authService", "login('admin', 'admin123')", () =>
      authService.login({ username: "admin", password: "admin123" })
    );
    await test("authService", "me()", () => authService.me());

    // 2. Floors Service
    await test("floorsService", "list()", () => floorsService.list());
    await test("floorsService", "getBySlug('floor-1')", () =>
      floorsService.getBySlug("floor-1")
    );

    // 3. Tables Service
    await test("tablesService", "list()", () => tablesService.list());
    await test("tablesService", "listByFloor('f1')", () =>
      tablesService.listByFloor("f1")
    );

    // 4. Categories Service
    await test("categoriesService", "list()", () => categoriesService.list());
    await test("categoriesService", "listByFloor('f1')", () =>
      categoriesService.listByFloor("f1")
    );

    // 5. Menu Items Service
    await test("menuItemsService", "list()", () => menuItemsService.list());
    await test("menuItemsService", "listByFloor('f1')", () =>
      menuItemsService.listByFloor("f1")
    );

    // 6. Printers Service
    await test("printersService", "list()", () => printersService.list());

    // 7. Orders Service
    await test("ordersService", "list()", () => ordersService.list());

    // 8. Reports Service
    await test("reportsService", "dailySales()", () => reportsService.dailySales());
    await test("reportsService", "categorySales()", () => reportsService.categorySales());
    await test("reportsService", "topItems()", () => reportsService.topItems());
    await test("reportsService", "waiterSales()", () => reportsService.waiterSales());

    // 9. Users Service
    await test("usersService", "list()", () => usersService.list());

    // 10. Live Workflow: Create Order -> Send Items -> Table turns occupied -> Pay Order -> Table turns free
    try {
      // Step A: Create order for Table f1-t1
      const order = await ordersService.create({
        tableId: "f1-t1",
        floorId: "f1",
        waiterId: "u2",
      });
      // Step B: Send 2 items to kitchen
      const sendResult = await ordersService.sendItems({
        tableId: "f1-t1",
        requestId: "test-req-dev-1",
        items: [
          { menuItemId: "mi4", qty: 2 },
          { menuItemId: "mi7", qty: 1 },
        ],
      });
      // Check table status
      const tableOccupied = await tablesService.getById("f1-t1");

      // Step C: Pay order
      const payResult = await ordersService.pay({
        orderId: order.id,
        requestId: "test-req-dev-pay-1",
        method: "cash",
        amountReceived: sendResult.order.total,
      });
      const tableFreed = await tablesService.getById("f1-t1");

      setOrderFlowResult(
        `SUCCESS: Created Order #${order.id.slice(-6)} -> Sent 2 items (Total Rs ${sendResult.order.total}) -> Table status '${tableOccupied.status}' (occupied) -> Paid Order ${payResult.order.billNo} via Cash (Total Rs ${payResult.order.total}) -> Table status '${tableFreed.status}' (freed) -> Cashier Slip: ${payResult.billPrintJob.status}`
      );
    } catch (err: unknown) {
      setOrderFlowResult(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }

    setIsRunning(false);
  };

  useEffect(() => {
    runChecks();
  }, []);

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-6">
      <div className="bg-white p-6 rounded-2xl border shadow-sm flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-gray-900">API Service & Mock Verification</h1>
            <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full uppercase">
              Temporary Test Suite
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Tests all domain services against the in-memory mock API adapter.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dev/tables"
            className="px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-primary font-bold rounded-xl text-sm hover:bg-indigo-100"
          >
            Tablet Sync Simulator &rarr;
          </Link>
          <button
            onClick={runChecks}
            disabled={isRunning}
            className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl shadow-md text-sm disabled:opacity-50 hover:bg-primary-hover"
          >
            {isRunning ? "Running..." : "Re-run Checks"}
          </button>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase">Total Tests</div>
          <div className="text-2xl font-extrabold text-gray-900 mt-1">{results.length}</div>
        </div>
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-emerald-600 uppercase">Passed</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{passCount}</div>
        </div>
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-red-500 uppercase">Failed</div>
          <div className="text-2xl font-extrabold text-red-600 mt-1">{failCount}</div>
        </div>
      </div>

      {/* Mock Printer Failure Simulator for F5 Testing */}
      <div className="p-6 bg-white border rounded-2xl shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 text-base">
              Kitchen Printer Failure Simulator (Task F5 Testing)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Simulates a hardware/network failure on a kitchen slip printer when sending an order.
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-800">
            Active Failure: {failedPrinter ? failedPrinter : "None (All printers online)"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => handleTogglePrinterFail(null)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${failedPrinter === null
              ? "bg-indigo-50 border-primary text-primary"
              : "bg-gray-50 border-border text-gray-700 hover:bg-gray-100"
              }`}
          >
            All Printers Normal (Success)
          </button>
          <button
            type="button"
            onClick={() => handleTogglePrinterFail("prn-1")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${failedPrinter === "prn-1"
              ? "bg-amber-100 border-amber-500 text-amber-900"
              : "bg-gray-50 border-border text-gray-700 hover:bg-gray-100"
              }`}
          >
            Fail Sweet Station Printer (prn-1)
          </button>
          <button
            type="button"
            onClick={() => handleTogglePrinterFail("prn-2")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${failedPrinter === "prn-2"
              ? "bg-amber-100 border-amber-500 text-amber-900"
              : "bg-gray-50 border-border text-gray-700 hover:bg-gray-100"
              }`}
          >
            Fail Spicy Station Printer (prn-2)
          </button>
          <button
            type="button"
            onClick={() => handleTogglePrinterFail("prn-cashier")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${failedPrinter === "prn-cashier"
              ? "bg-amber-100 border-amber-500 text-amber-900"
              : "bg-gray-50 border-border text-gray-700 hover:bg-gray-100"
              }`}
          >
            Fail Cashier Bill Printer (prn-cashier)
          </button>
        </div>
      </div>

      {/* Full Order Lifecycle Workflow Test */}
      <div className="p-6 bg-white border rounded-2xl shadow-sm space-y-2">
        <h2 className="font-bold text-gray-900 text-base">
          End-to-End Workflow Test (Create Order ➔ Send Items ➔ Table turns Occupied ➔ Pay ➔ Table turns Free)
        </h2>
        <pre className="p-3 bg-gray-50 rounded-xl text-xs font-mono text-gray-800 whitespace-pre-wrap">
          {orderFlowResult}
        </pre>
      </div>

      {/* Individual Endpoint Results */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b font-bold text-sm bg-gray-50 text-gray-700">
          Individual Service Calls
        </div>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {results.map((r, i) => (
            <div key={i} className="p-4 flex items-start justify-between text-xs font-mono gap-4">
              <div className="space-y-1">
                <div className="font-bold text-gray-900">
                  {r.service}.{r.endpoint}
                </div>
                {r.error && <div className="text-red-600">{r.error}</div>}
              </div>
              <span
                className={`px-2.5 py-1 rounded-md uppercase font-bold text-[10px] ${r.status === "pass"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
                  }`}
              >
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
