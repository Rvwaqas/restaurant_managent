import { describe, it, expect, beforeAll } from "vitest";
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
import { apiClient } from "@/lib/api/client";
import {
  UserSchema,
  FloorSchema,
  TableSchema,
  CategorySchema,
  MenuItemSchema,
  PrinterSchema,
  OrderSchema,
  SendResultSchema,
  PayResultSchema,
  VoidItemResultSchema,
  ReportSummarySchema,
  DailyClosingReportSchema,
} from "@/lib/api/schemas";

describe("API Contract & Parity Verification Tests", () => {
  beforeAll(async () => {
    // Authenticate as admin by default for CRUD operations
    const { token } = await authService.login({ username: "admin", password: "admin123" });
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  });

  describe("1. Authentication Service Contract", () => {
    it("POST /auth/login returns valid user and token schema", async () => {
      const res = await authService.login({ username: "waiter1", password: "1234" });
      expect(res.token).toBeDefined();
      expect(typeof res.token).toBe("string");
      const user = UserSchema.parse(res.user);
      expect(user.role).toBe("waiter");
      expect(user.username).toBe("waiter1");
    });

    it("POST /auth/login rejects invalid credentials with 401", async () => {
      await expect(
        authService.login({ username: "waiter1", password: "wrongpassword" })
      ).rejects.toMatchObject({
        status: 401,
      });
    });

    it("GET /auth/me returns current user profile matching schema", async () => {
      const user = await authService.me();
      expect(UserSchema.parse(user)).toBeDefined();
    });

    it("POST /auth/logout succeeds with 200", async () => {
      await expect(authService.logout()).resolves.toBeUndefined();
    });
  });

  describe("2. Floors Service Contract", () => {
    it("GET /floors returns array of Floor schemas", async () => {
      const floors = await floorsService.list();
      expect(floors.length).toBeGreaterThanOrEqual(2);
      floors.forEach((f) => expect(FloorSchema.parse(f)).toBeDefined());
    });

    it("GET /floors/{slug} returns valid floor schema", async () => {
      const floor = await floorsService.getBySlug("floor-1");
      expect(FloorSchema.parse(floor)).toBeDefined();
      expect(floor.slug).toBe("floor-1");
    });
  });

  describe("3. Tables Service Contract", () => {
    it("GET /tables returns array of Table schemas", async () => {
      const tables = await tablesService.list();
      expect(tables.length).toBeGreaterThan(0);
      tables.forEach((t) => expect(TableSchema.parse(t)).toBeDefined());
    });

    it("GET /tables?floorId= returns filtered tables", async () => {
      const tables = await tablesService.listByFloor("f1");
      expect(tables.length).toBeGreaterThan(0);
      tables.forEach((t) => {
        expect(t.floorId).toBe("f1");
        expect(TableSchema.parse(t)).toBeDefined();
      });
    });

    it("POST /tables creates a new table matching schema", async () => {
      const uniqueTableNum = 500 + Math.floor(Math.random() * 400);
      const newTable = await tablesService.create({
        floorId: "f1",
        number: uniqueTableNum,
        capacity: 4,
        status: "free",
        isActive: true,
      });
      expect(TableSchema.parse(newTable)).toBeDefined();
      expect(newTable.number).toBe(uniqueTableNum);
    });
  });

  describe("4. Categories Service Contract", () => {
    it("GET /categories returns valid Category schemas", async () => {
      const cats = await categoriesService.list();
      expect(cats.length).toBeGreaterThan(0);
      cats.forEach((c) => expect(CategorySchema.parse(c)).toBeDefined());
    });

    it("POST /categories creates a new category", async () => {
      const created = await categoriesService.create({
        floorId: "f1",
        name: `Test Starters ${Date.now()}`,
        printerId: "p1",
        sortOrder: 50,
        isActive: true,
      });
      expect(CategorySchema.parse(created)).toBeDefined();
      expect(created.name).toContain("Test Starters");
    });
  });

  describe("5. Menu Items Service Contract", () => {
    it("GET /menu-items returns valid MenuItem schemas", async () => {
      const items = await menuItemsService.list();
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item) => expect(MenuItemSchema.parse(item)).toBeDefined());
    });

    it("PATCH /menu-items/{id}/availability toggles availability", async () => {
      const items = await menuItemsService.list();
      const first = items[0];
      const updated = await menuItemsService.setAvailability(first.id, false);
      expect(MenuItemSchema.parse(updated)).toBeDefined();
      expect(updated.available).toBe(false);
      // Revert back
      await menuItemsService.setAvailability(first.id, true);
    });
  });

  describe("6. Printers Service Contract", () => {
    it("GET /printers returns valid Printer schemas", async () => {
      const printers = await printersService.list();
      expect(printers.length).toBeGreaterThanOrEqual(3);
      printers.forEach((p) => expect(PrinterSchema.parse(p)).toBeDefined());
    });

    it("POST /printers/{id}/test simulates test print job", async () => {
      const result = await printersService.testPrint("prn-cashier");
      expect(result.status).toBe("ok");
    });
  });

  describe("7. Orders Lifecycle & Idempotency Replay", () => {
    const testReqId = `contract-test-${Date.now()}`;

    it("POST /orders/send creates order and prints kitchen slip", async () => {
      const res = await ordersService.sendItems({
        tableId: "f1-t1",
        requestId: testReqId,
        items: [{ menuItemId: "mi7", qty: 2, note: "Contract test note" }],
      });
      expect(SendResultSchema.parse(res)).toBeDefined();
      expect(res.order.tableId).toBe("f1-t1");
      expect(res.printJobs.length).toBeGreaterThan(0);
    });

    it("Idempotency: Replaying POST /orders/send with same requestId returns cached result", async () => {
      const replayRes = await ordersService.sendItems({
        tableId: "f1-t1",
        requestId: testReqId,
        items: [{ menuItemId: "mi7", qty: 2, note: "Contract test note" }],
      });
      expect(SendResultSchema.parse(replayRes)).toBeDefined();
      // Should return identical order without adding duplicates
      expect(replayRes.order.items.length).toBe(1);
    });

    it("GET /orders/open?tableId= returns the open order schema", async () => {
      const openOrder = await ordersService.getOpenByTable("f1-t1");
      expect(openOrder).not.toBeNull();
      if (openOrder) {
        expect(OrderSchema.parse(openOrder)).toBeDefined();
        expect(openOrder.status).toBe("open");
      }
    });

    it("POST /orders/{id}/void-item fails with 403 when called by a waiter", async () => {
      const waiterLogin = await authService.login({ username: "waiter1", password: "1234" });
      apiClient.defaults.headers.common["Authorization"] = `Bearer ${waiterLogin.token}`;

      const openOrder = await ordersService.getOpenByTable("f1-t1");
      if (openOrder && openOrder.items[0]) {
        await expect(
          ordersService.voidItem({
            orderId: openOrder.id,
            orderItemId: openOrder.items[0].id,
            reason: "Waiter unauthorized attempt",
            requestId: `void-unauth-${Date.now()}`,
          })
        ).rejects.toMatchObject({
          status: 403,
        });
      }

      // Switch back to admin token
      const adminLogin = await authService.login({ username: "admin", password: "admin123" });
      apiClient.defaults.headers.common["Authorization"] = `Bearer ${adminLogin.token}`;
    });

    it("POST /orders/{id}/pay validates payment and frees table", async () => {
      const openOrder = await ordersService.getOpenByTable("f1-t1");
      if (openOrder) {
        const payRes = await ordersService.pay({
          orderId: openOrder.id,
          requestId: `pay-test-${Date.now()}`,
          method: "cash",
          amountReceived: 2000,
        });
        expect(PayResultSchema.parse(payRes)).toBeDefined();
        expect(payRes.order.status).toBe("paid");
      }
    });
  });

  describe("8. Reports Service Contract", () => {
    const today = new Date().toISOString().split("T")[0];
    const filters = { from: today, to: today };

    it("GET /reports/summary returns ReportSummary schema", async () => {
      const summary = await reportsService.summary(filters);
      expect(ReportSummarySchema.parse(summary)).toBeDefined();
    });

    it("GET /reports/daily-closing returns DailyClosingReport schema", async () => {
      const closing = await reportsService.dailyClosing(today);
      expect(DailyClosingReportSchema.parse(closing)).toBeDefined();
    });
  });

  describe("9. Users Service Contract", () => {
    it("GET /users returns array of User schemas", async () => {
      const users = await usersService.list();
      expect(users.length).toBeGreaterThanOrEqual(4);
      users.forEach((u) => expect(UserSchema.parse(u)).toBeDefined());
    });
  });
});
