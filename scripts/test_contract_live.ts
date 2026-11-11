/**
 * Live Contract Check against real FastAPI + SQLite backend.
 * Validates all app service endpoints against Zod schemas in src/lib/api/schemas.
 *
 * Usage:
 *   npx tsx scripts/test_contract_live.ts
 */

process.env.NEXT_PUBLIC_USE_MOCK = "false";
process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000/api";

import { z } from "zod";
import { apiClient } from "../src/lib/api/client";
import {
  authService,
  floorsService,
  tablesService,
  categoriesService,
  menuService,
  printersService,
  uploadsService,
  ordersService,
  reportsService,
} from "../src/lib/api/services";
import {
  UserSchema,
  FloorSchema,
  TableSchema,
  CategorySchema,
  FloorMenuResponseSchema,
  PrinterSchema,
  TestPrintResultSchema,
  UploadImageResultSchema,
  OrderSchema,
  SendResultSchema,
  PayResultSchema,
  PrintJobSchema,
  VoidItemResultSchema,
  ListPaidResponseSchema,
  ReportSummarySchema,
  SalesOverTimeBucketSchema,
  CategorySalesRowSchema,
  FloorSalesRowSchema,
  WaiterSalesRowSchema,
  TopItemRowSchema,
  PaymentMethodRowSchema,
  PeakHourCellSchema,
  DiscountRowSchema,
  VoidedItemRowSchema,
  DailyClosingReportSchema,
} from "../src/lib/api/schemas";

let currentToken: string | null = null;

// Ensure token is attached in Node environment
apiClient.interceptors.request.use((config) => {
  if (currentToken && config.headers) {
    config.headers.Authorization = `Bearer ${currentToken}`;
  }
  return config;
});

let okCount = 0;
let failCount = 0;

async function check<T>(
  name: string,
  fn: () => Promise<T>,
  validator: (data: T) => void
): Promise<T | null> {
  try {
    const res = await fn();
    validator(res);
    console.log(`[OK]       ${name}`);
    okCount++;
    return res;
  } catch (err: any) {
    console.error(`[MISMATCH] ${name}: ${err?.message || err}`);
    if (err?.errors) {
      console.error(`           Schema details: ${JSON.stringify(err.errors)}`);
    }
    failCount++;
    return null;
  }
}

async function runLiveContractTests() {
  console.log("========================================================");
  console.log(" SOUFI POS - LIVE BACKEND CONTRACT VERIFICATION");
  console.log(" Target: http://127.0.0.1:8000/api");
  console.log("========================================================\n");

  // 1. Health check
  await check(
    "GET    /health",
    async () => {
      const { data } = await apiClient.get("http://127.0.0.1:8000/api/health");
      return data;
    },
    (data) => {
      if (data.status !== "ok") throw new Error(`Status was ${data.status}`);
    }
  );

  // 2. Auth: Waiter Login
  const waiterAuth = await check(
    "POST   /auth/login (waiter)",
    () => authService.login({ username: "waiter1", password: "waiter123" }),
    (data) => {
      UserSchema.parse(data.user);
      if (data.user.role !== "waiter") throw new Error("Expected role waiter");
      if (!data.token) throw new Error("Missing JWT token");
    }
  );

  if (waiterAuth?.token) {
    currentToken = waiterAuth.token;
  }

  // Auth: me
  await check(
    "GET    /auth/me",
    () => authService.me(),
    (user) => {
      UserSchema.parse(user);
    }
  );

  // Auth: Admin Login (Switch token to admin for subsequent management/reports endpoints)
  const adminAuth = await check(
    "POST   /auth/login (admin)",
    () => authService.login({ username: "admin", password: "admin123" }),
    (data) => {
      UserSchema.parse(data.user);
      if (data.user.role !== "admin") throw new Error("Expected role admin");
    }
  );

  if (adminAuth?.token) {
    currentToken = adminAuth.token;
  }

  // 3. Floors
  const floors = await check(
    "GET    /floors",
    () => floorsService.list(),
    (list) => {
      z.array(FloorSchema).parse(list);
      if (list.length < 2) throw new Error("Expected at least 2 floors (f1, f2)");
    }
  );

  await check(
    "GET    /floors/f1",
    () => floorsService.getById("f1"),
    (floor) => {
      FloorSchema.parse(floor);
    }
  );

  // 4. Tables
  const tables = await check(
    "GET    /tables?floorId=f1",
    () => tablesService.listByFloor("f1"),
    (list) => {
      z.array(TableSchema).parse(list);
      if (list.length < 1) throw new Error("Expected tables for floor f1");
    }
  );

  await check(
    "GET    /tables/f1-t1",
    () => tablesService.getById("f1-t1"),
    (table) => {
      TableSchema.parse(table);
    }
  );

  // 5. Categories
  await check(
    "GET    /categories?floorId=f1",
    () => categoriesService.listByFloor("f1"),
    (list) => {
      z.array(CategorySchema).parse(list);
    }
  );

  // 6. Menu (Floor 1 & Floor 2)
  const menuF1 = await check(
    "GET    /menu?floorId=f1",
    () => menuService.listByFloor("f1"),
    (resp) => {
      FloorMenuResponseSchema.parse(resp);
      if (resp.items.length === 0) throw new Error("Expected menu items for f1");
    }
  );

  const menuF2 = await check(
    "GET    /menu?floorId=f2",
    () => menuService.listByFloor("f2"),
    (resp) => {
      FloorMenuResponseSchema.parse(resp);
      if (resp.items.length === 0) throw new Error("Expected menu items for f2");
    }
  );

  // 7. Printers
  const printers = await check(
    "GET    /printers",
    () => printersService.list(),
    (list) => {
      z.array(PrinterSchema).parse(list);
    }
  );

  await check(
    "POST   /printers/p1/test",
    () => printersService.testPrint("p1"),
    (res) => {
      TestPrintResultSchema.parse(res);
    }
  );

  // 8. Uploads
  await check(
    "POST   /uploads/image",
    async () => {
      const tinyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );
      const blob = new Blob([tinyPng], { type: "image/png" });
      const file = new File([blob], "test-contract.png", { type: "image/png" });
      return uploadsService.uploadImage(file);
    },
    (res) => {
      UploadImageResultSchema.parse(res);
      if (!res.url) throw new Error("Expected url string in upload result");
    }
  );

  // 9. Orders Lifecycle (send -> reprint -> void -> pay -> reprintBill -> listPaid)
  const testTableId = "f1-t1";
  const item1 = menuF1?.items[0];
  const item2 = menuF1?.items[1] || menuF1?.items[0];

  if (item1 && item2) {
    // Check initial table status
    await check(
      "GET    /orders/open?tableId=f1-t1",
      () => ordersService.getOpenByTable(testTableId),
      (order) => {
        if (order) OrderSchema.parse(order);
      }
    );

    // Send batch 1
    const sendRes1 = await check(
      "POST   /orders/send-items (batch 1)",
      () =>
        ordersService.sendItems({
          tableId: testTableId,
          requestId: `req-contract-send-1-${Date.now()}`,
          items: [{ menuItemId: item1.id, qty: 2, note: "Contract test batch 1" }],
        }),
      (res) => {
        SendResultSchema.parse(res);
      }
    );

    const activeOrderId = sendRes1?.order?.id;

    if (activeOrderId) {
      // Reprint kitchen slip
      await check(
        "POST   /orders/reprint",
        () => ordersService.reprint(activeOrderId, 1, item1.categoryId),
        (job) => {
          PrintJobSchema.parse(job);
        }
      );

      // Send batch 2
      await check(
        "POST   /orders/send-items (batch 2)",
        () =>
          ordersService.sendItems({
            tableId: testTableId,
            requestId: `req-contract-send-2-${Date.now()}`,
            items: [{ menuItemId: item2.id, qty: 1, note: "Item to void" }],
          }),
        (res) => {
          SendResultSchema.parse(res);
        }
      );

      // Void item from batch 2
      await check(
        "POST   /orders/{id}/void-item",
        () =>
          ordersService.voidItem({
            orderId: activeOrderId,
            menuItemId: item2.id,
            batchNo: 2,
            reason: "Contract testing cancellation",
          }),
        (res) => {
          VoidItemResultSchema.parse(res);
        }
      );

      // Pay order with cash
      await check(
        "POST   /orders/{id}/pay",
        () =>
          ordersService.pay({
            orderId: activeOrderId,
            requestId: `req-contract-pay-${Date.now()}`,
            method: "cash",
            amountReceived: 10000,
          }),
        (payRes) => {
          PayResultSchema.parse(payRes);
        }
      );

      // Reprint bill
      await check(
        "POST   /orders/{id}/reprint-bill",
        () => ordersService.reprintBill(activeOrderId),
        (billJob) => {
          PrintJobSchema.parse(billJob);
        }
      );
    }
  }

  // List paid orders
  await check(
    "GET    /orders/paid",
    () => ordersService.listPaid({ limit: 10 }),
    (res) => {
      ListPaidResponseSchema.parse(res);
    }
  );

  // 10. Reports Service Endpoints
  await check(
    "GET    /reports/summary",
    () => reportsService.summary(),
    (res) => {
      ReportSummarySchema.parse(res);
    }
  );

  await check(
    "GET    /reports/sales-over-time",
    () => reportsService.salesOverTime(undefined, "hour"),
    (res) => {
      z.array(SalesOverTimeBucketSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/by-category",
    () => reportsService.byCategory(),
    (res) => {
      z.array(CategorySalesRowSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/by-floor",
    () => reportsService.byFloor(),
    (res) => {
      z.array(FloorSalesRowSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/by-waiter",
    () => reportsService.byWaiter(),
    (res) => {
      z.array(WaiterSalesRowSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/top-items",
    () => reportsService.topItems(),
    (res) => {
      z.array(TopItemRowSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/by-payment-method",
    () => reportsService.byPaymentMethod(),
    (res) => {
      z.array(PaymentMethodRowSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/peak-hours",
    () => reportsService.peakHours(),
    (res) => {
      z.array(PeakHourCellSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/discounts",
    () => reportsService.discounts(),
    (res) => {
      z.array(DiscountRowSchema).parse(res);
    }
  );

  await check(
    "GET    /reports/voided-items",
    () => reportsService.voidedItems(),
    (res) => {
      z.array(VoidedItemRowSchema).parse(res);
    }
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  await check(
    "GET    /reports/daily-closing",
    () => reportsService.dailyClosing(todayStr),
    (res) => {
      DailyClosingReportSchema.parse(res);
    }
  );

  console.log("\n========================================================");
  console.log(` RESULTS: ${okCount} OK, ${failCount} Mismatch`);
  console.log("========================================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runLiveContractTests().catch((e) => {
  console.error("Contract test execution failed:", e);
  process.exit(1);
});

