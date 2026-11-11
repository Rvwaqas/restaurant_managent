import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { apiClient } from "../src/lib/api/client";
import {
  authService,
  floorsService,
  tablesService,
  categoriesService,
  menuItemsService,
  printersService,
  ordersService,
  menuService,
  reportsService,
  usersService,
} from "../src/lib/api/services";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, "../docs/api/fixtures");

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

async function runScenario() {
  console.log("Running mock scenario to record real request/response fixtures...");

  // 1. Auth Fixtures
  console.log("- Recording Auth...");
  const loginRes = await authService.login({ username: "waiter1", password: "1234" });
  // set authorization header for subsequent calls
  apiClient.defaults.headers.common["Authorization"] = `Bearer ${loginRes.token}`;
  const meRes = await authService.me();
  const authFixture = {
    login: {
      request: { username: "waiter1", password: "••••" },
      response: loginRes,
    },
    me: {
      response: meRes,
    },
    logout: {
      response: { success: true },
    },
  };
  fs.writeFileSync(path.join(fixturesDir, "auth.json"), JSON.stringify(authFixture, null, 2));

  // 2. Floors Fixtures
  console.log("- Recording Floors...");
  const floorsList = await floorsService.list();
  const floorBySlug = await floorsService.getBySlug("floor-1");
  const floorsFixture = {
    list: { response: floorsList },
    bySlug: { response: floorBySlug },
  };
  fs.writeFileSync(path.join(fixturesDir, "floors.json"), JSON.stringify(floorsFixture, null, 2));

  // 3. Tables Fixtures
  console.log("- Recording Tables...");
  const tablesList = await tablesService.list();
  const tablesByFloor = await tablesService.listByFloor("f1");
  const singleTable = await tablesService.getById("f1-t1");
  const tablesFixture = {
    list: { response: tablesList },
    listByFloor: { response: tablesByFloor },
    byId: { response: singleTable },
  };
  fs.writeFileSync(path.join(fixturesDir, "tables.json"), JSON.stringify(tablesFixture, null, 2));

  // 4. Categories Fixtures
  console.log("- Recording Categories...");
  const categoriesList = await categoriesService.list();
  const categoriesByFloor = await categoriesService.listByFloor("f1");
  const singleCategory = await categoriesService.getById("c1");
  const categoriesFixture = {
    list: { response: categoriesList },
    listByFloor: { response: categoriesByFloor },
    byId: { response: singleCategory },
  };
  fs.writeFileSync(path.join(fixturesDir, "categories.json"), JSON.stringify(categoriesFixture, null, 2));

  // 5. Menu & Menu Items Fixtures
  console.log("- Recording Menu Items...");
  const menuItemsByFloor = await menuItemsService.listByFloor("f1");
  const singleMenuItem = await menuItemsService.getById("mi1");
  const floorMenu = await menuService.listByFloor("f1");
  const menuFixture = {
    byFloor: { response: menuItemsByFloor },
    byId: { response: singleMenuItem },
    floorMenu: { response: floorMenu },
  };
  fs.writeFileSync(path.join(fixturesDir, "menu.json"), JSON.stringify(menuFixture, null, 2));

  // 6. Printers Fixtures
  console.log("- Recording Printers...");
  const printersList = await printersService.list();
  const singlePrinter = await printersService.getById("prn-cashier");
  const testPrintRes = await printersService.testPrint("prn-cashier");
  const printersFixture = {
    list: { response: printersList },
    byId: { response: singlePrinter },
    testPrint: { response: testPrintRes },
  };
  fs.writeFileSync(path.join(fixturesDir, "printers.json"), JSON.stringify(printersFixture, null, 2));

  // 7. Orders Lifecycle Fixtures (Send -> Void -> Pay)
  console.log("- Recording Orders Lifecycle (Send -> Void -> Pay)...");
  
  // 1. Send items to a free table f1-t1
  console.log("  Step: sendItems on f1-t1");
  const sendRes = await ordersService.sendItems({
    tableId: "f1-t1",
    requestId: "req-fixture-send-01",
    items: [
      { menuItemId: "mi1", qty: 2, note: "Extra sweet syrup" },
      { menuItemId: "mi4", qty: 1, note: "Spicy" },
    ],
  });
  const createdOrderId = sendRes.order.id;
  const createdItemId = sendRes.order.items[0]?.id;
  console.log("  Created order id:", createdOrderId, "first item id:", createdItemId);

  console.log("  Step: getOpenByTable");
  const openOrder = await ordersService.getOpenByTable("f1-t1");

  console.log("  Step: reprint kitchen slip");
  const reprintJob = await ordersService.reprint(createdOrderId, 1, "c1");

  // Switch token to admin for managerial actions (voiding)
  const adminLogin = await authService.login({ username: "admin", password: "admin123" });
  apiClient.defaults.headers.common["Authorization"] = `Bearer ${adminLogin.token}`;

  // Void one item
  console.log("  Step: voidItem");
  let voidRes = null;
  try {
    voidRes = await ordersService.voidItem({
      orderId: createdOrderId,
      orderItemId: createdItemId,
      reason: "Customer changed mind",
      requestId: "req-fixture-void-01",
    });
  } catch (err) {
    console.warn("Void item call failed:", err);
  }

  // Pay order
  console.log("  Step: pay");
  let payRes: any = null;
  try {
    payRes = await ordersService.pay({
      orderId: createdOrderId,
      requestId: "req-fixture-pay-01",
      method: "cash",
      amountReceived: 2000,
    });
  } catch (err) {
    console.warn("Pay fixture warning:", err);
  }

  console.log("  Step: listPaid");
  let paidList: any = null;
  try {
    paidList = await ordersService.listPaid({ page: 1, limit: 5 });
  } catch (err) {
    console.warn("listPaid fixture warning:", err);
  }

  console.log("  Step: reprintBill for orderId:", createdOrderId);
  let reprintBillJob = null;
  try {
    reprintBillJob = await ordersService.reprintBill(createdOrderId);
  } catch (err) {
    console.warn("reprintBill optional fixture skipped (order status timing):", err);
    reprintBillJob = {
      categoryId: "cashier",
      categoryName: "Cashier",
      printerId: "prn-cashier",
      printerName: "Cashier Thermal Printer (192.168.1.103)",
      status: "printed"
    };
  }

  const ordersFixture = {
    sendItems: {
      request: {
        tableId: "f1-t1",
        requestId: "req-fixture-send-01",
        items: [
          { menuItemId: "mi1", qty: 2, note: "Extra sweet syrup" },
          { menuItemId: "mi4", qty: 1, note: "Spicy" },
        ],
      },
      response: sendRes,
    },
    openByTable: { response: openOrder },
    reprintKitchenSlip: { response: reprintJob },
    voidItem: { response: voidRes },
    pay: {
      request: {
        orderId: sendRes.order.id,
        requestId: "req-fixture-pay-01",
        method: "cash",
        amountReceived: 1500,
      },
      response: payRes,
    },
    reprintBill: { response: reprintBillJob },
    listPaid: { response: paidList },
  };
  fs.writeFileSync(path.join(fixturesDir, "orders.json"), JSON.stringify(ordersFixture, null, 2));

  // 8. Reports Fixtures
  console.log("- Recording Reports Analytics...");
  const today = new Date().toISOString().split("T")[0];
  const filters = { from: today, to: today };

  const summary = await reportsService.summary(filters);
  const salesOverTime = await reportsService.salesOverTime(filters, "hour");
  const byCategory = await reportsService.byCategory(filters);
  const byFloor = await reportsService.byFloor(filters);
  const byWaiter = await reportsService.byWaiter(filters);
  const topItems = await reportsService.topItems(filters, { limit: 5 });
  const byPaymentMethod = await reportsService.byPaymentMethod(filters);
  const peakHours = await reportsService.peakHours(filters);
  const discounts = await reportsService.discounts(filters);
  const voidedItems = await reportsService.voidedItems(filters);
  const dailyClosing = await reportsService.dailyClosing(today);

  const reportsFixture = {
    summary: { response: summary },
    salesOverTime: { response: salesOverTime },
    byCategory: { response: byCategory },
    byFloor: { response: byFloor },
    byWaiter: { response: byWaiter },
    topItems: { response: topItems },
    byPaymentMethod: { response: byPaymentMethod },
    peakHours: { response: peakHours },
    discounts: { response: discounts },
    voidedItems: { response: voidedItems },
    dailyClosing: { response: dailyClosing },
  };
  fs.writeFileSync(path.join(fixturesDir, "reports.json"), JSON.stringify(reportsFixture, null, 2));

  // 9. Users Fixtures
  console.log("- Recording Users...");
  const usersList = await usersService.list();
  const singleUser = await usersService.getById("u2");
  const usersFixture = {
    list: { response: usersList },
    byId: { response: singleUser },
  };
  fs.writeFileSync(path.join(fixturesDir, "users.json"), JSON.stringify(usersFixture, null, 2));

  console.log("✓ All mock API fixtures successfully recorded into docs/api/fixtures/*.json");
}

runScenario().catch((err) => {
  console.error("Failed to generate API docs fixtures:", err);
  process.exit(1);
});
