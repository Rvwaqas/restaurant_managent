import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { createMockState, seedPasswords } from "./seed";
import type { MockState } from "./seed";
import type {
  Table,
  Order,
  OrderItem,
  SendItemsPayload,
  SendResult,
  PrintJob,
  PayRequest,
  PayResult,
  VoidItemRequest,
  VoidItemResult,
  User,
  Category,
  MenuItem,
  Printer,
} from "@/types";
import { TAX_RATE, SERVICE_CHARGE_RATE, CASHIER_PRINTER_ID } from "@/config/app";

let mockState: MockState | null = null;
const idempotentSendResults = new Map<string, SendResult>();
const idempotentPayResults = new Map<string, PayResult>();
import { setMockFailedPrinterId, getMockFailedPrinterId } from "./mockControl";
export { setMockFailedPrinterId, getMockFailedPrinterId };

const idempotentVoidResults = new Map<string, VoidItemResult>();
let dailyBillSeq = 2;

function getState(): MockState {
  if (!mockState) {
    mockState = createMockState();
  }
  return mockState;
}

function genId(): string {
  const state = getState();
  state.nextId += 1;
  return `mock-${state.nextId}`;
}

export function setupMockApi(): void {
  // Simulate 400-600ms network latency typical on local restaurant WiFi
  const mock = new MockAdapter(apiClient, { delayResponse: 500 });
  const state = getState();

  // ─── AUTH ───
  mock.onPost("/auth/login").reply((config) => {
    try {
      const body = JSON.parse(config.data || "{}");
      const user = state.users.find((u) => u.username === body.username);
      if (!user || seedPasswords[user.username] !== body.password) {
        return [401, { message: "Invalid username or password" }];
      }
      // 12 hours expiry
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      return [
        200,
        {
          token: `mock-token-${user.id}`,
          user,
          expiresAt,
        },
      ];
    } catch {
      return [400, { message: "Invalid JSON payload" }];
    }
  });

  mock.onGet("/auth/me").reply((config) => {
    const authHeader = config.headers?.Authorization;
    const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : "";
    if (!token) return [401, { message: "Not authenticated" }];
    const userId = token.replace("mock-token-", "");
    const user = state.users.find((u) => u.id === userId);
    if (!user) return [401, { message: "Invalid token" }];
    return [200, user];
  });

  mock.onPost("/auth/logout").reply(200, { success: true });

  // ─── FLOORS ───
  mock.onGet("/floors").reply(() => [200, state.floors]);
  mock.onGet(/\/floors\/.+/).reply((config) => {
    const slug = config.url?.split("/floors/")[1];
    const floor = state.floors.find((f) => f.slug === slug);
    if (!floor) return [404, { message: "Floor not found" }];
    return [200, floor];
  });

  // ─── TABLES ───
  mock.onGet(/\/tables\?floorId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const floorId = url.searchParams.get("floorId");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    let filtered = state.tables.filter((t) => t.floorId === floorId);
    if (!includeInactive) {
      filtered = filtered.filter((t) => t.isActive !== false);
    }
    return [200, filtered];
  });
  mock.onGet("/tables").reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    if (!includeInactive) {
      return [200, state.tables.filter((t) => t.isActive !== false)];
    }
    return [200, state.tables];
  });
  mock.onGet(/\/tables\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/tables/")[1]?.split("/")[0];
    const table = state.tables.find((t) => t.id === id);
    if (!table) return [404, { message: "Table not found" }];
    return [200, table];
  });

  // Bulk create tables (Task F7)
  mock.onPost("/tables/bulk").reply((config) => {
    const body = JSON.parse(config.data || "{}") as {
      floorId: string;
      from: number;
      to: number;
      capacity: number;
    };
    const { floorId, from, to, capacity } = body;
    if (!floorId || typeof from !== "number" || typeof to !== "number") {
      return [400, { message: "Invalid payload: floorId, from, and to are required." }];
    }
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    const existingNumbers = new Set(
      state.tables
        .filter((t) => t.floorId === floorId && t.isActive !== false)
        .map((t) => t.number)
    );

    const created: Table[] = [];
    const skippedNumbers: number[] = [];

    for (let num = min; num <= max; num++) {
      if (existingNumbers.has(num)) {
        skippedNumbers.push(num);
      } else {
        const newTable: Table = {
          id: genId(),
          floorId,
          number: num,
          capacity: capacity || 4,
          status: "free",
          isActive: true,
        };
        state.tables.push(newTable);
        created.push(newTable);
      }
    }

    return [200, { created, skippedNumbers }];
  });

  mock.onPost("/tables").reply((config) => {
    const body = JSON.parse(config.data || "{}") as Partial<Table>;
    if (!body.floorId || body.number === undefined) {
      return [400, { message: "floorId and table number are required." }];
    }
    const exists = state.tables.some(
      (t) => t.floorId === body.floorId && t.number === body.number && t.isActive !== false
    );
    if (exists) {
      return [409, { message: `Table ${body.number} already exists on this floor.` }];
    }
    const newTable: Table = {
      id: genId(),
      floorId: body.floorId,
      number: Number(body.number),
      capacity: body.capacity ? Number(body.capacity) : 4,
      status: "free",
      isActive: body.isActive !== undefined ? body.isActive : true,
    };
    state.tables.push(newTable);
    return [201, newTable];
  });

  mock.onPut(/\/tables\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/tables/")[1]?.split("/")[0];
    const body = JSON.parse(config.data || "{}") as Partial<Table>;
    const table = state.tables.find((t) => t.id === id);
    if (!table) return [404, { message: "Table not found" }];

    if (body.number !== undefined && body.number !== table.number) {
      const exists = state.tables.some(
        (t) =>
          t.id !== id &&
          t.floorId === table.floorId &&
          t.number === body.number &&
          t.isActive !== false
      );
      if (exists) {
        return [409, { message: `Table ${body.number} already exists on this floor.` }];
      }
    }

    Object.assign(table, body);
    return [200, table];
  });

  mock.onDelete(/\/tables\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/tables/")[1]?.split("/")[0];
    const table = state.tables.find((t) => t.id === id);
    if (!table) return [404, { message: "Table not found" }];

    if (table.status === "occupied") {
      return [409, { message: "Cannot delete table while it is currently occupied." }];
    }

    const hasOrderHistory = state.orders.some((o) => o.tableId === id);
    if (hasOrderHistory) {
      table.isActive = false;
      return [
        200,
        {
          success: true,
          softDeleted: true,
          message: `Table ${table.number} has historical orders; deactivated instead of deleted.`,
        },
      ];
    }

    const idx = state.tables.findIndex((t) => t.id === id);
    if (idx >= 0) state.tables.splice(idx, 1);
    return [200, { success: true, softDeleted: false, message: `Table ${table.number} deleted.` }];
  });

  mock.onPatch(/\/tables\/.+\/status/).reply((config) => {
    const id = config.url?.split("/tables/")[1]?.split("/")[0];
    const body = JSON.parse(config.data || "{}");
    const table = state.tables.find((t) => t.id === id);
    if (!table) return [404, { message: "Table not found" }];
    if (body.status) {
      table.status = body.status;
      if (body.status === "occupied") {
        if (!table.openedAt) table.openedAt = new Date().toISOString();
        if (body.runningTotal !== undefined) {
          table.runningTotal = body.runningTotal;
        } else if (!table.runningTotal) {
          table.runningTotal = 35.0;
        }
      } else if (body.status === "free") {
        table.openedAt = undefined;
        table.runningTotal = undefined;
        table.currentOrderId = undefined;
      }
    }
    if (body.currentOrderId !== undefined) table.currentOrderId = body.currentOrderId;
    return [200, table];
  });

  // ─── CATEGORIES ───
  mock.onGet(/\/categories\?floorId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const floorId = url.searchParams.get("floorId");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    let filtered = state.categories.filter((c) => c.floorId === floorId);
    if (!includeInactive) {
      filtered = filtered.filter((c) => c.isActive !== false);
    }
    filtered.sort((a, b) => a.sortOrder - b.sortOrder);
    return [200, filtered];
  });
  mock.onGet("/categories").reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    if (!includeInactive) {
      return [200, state.categories.filter((c) => c.isActive !== false)];
    }
    return [200, state.categories];
  });
  mock.onGet(/\/categories\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/categories/")[1];
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return [404, { message: "Category not found" }];
    return [200, cat];
  });

  // Reorder categories (Task F7)
  mock.onPost("/categories/reorder").reply((config) => {
    const body = JSON.parse(config.data || "{}") as { floorId: string; orderedIds: string[] };
    const { floorId, orderedIds } = body;
    if (!floorId || !Array.isArray(orderedIds)) {
      return [400, { message: "floorId and orderedIds array are required." }];
    }
    orderedIds.forEach((id, index) => {
      const cat = state.categories.find((c) => c.id === id && c.floorId === floorId);
      if (cat) cat.sortOrder = index + 1;
    });
    const updated = state.categories
      .filter((c) => c.floorId === floorId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return [200, updated];
  });

  mock.onPost("/categories").reply((config) => {
    const body = JSON.parse(config.data || "{}") as Partial<Category>;
    if (!body.floorId || !body.name?.trim()) {
      return [400, { message: "floorId and name are required." }];
    }
    const nameTrimmed = body.name.trim();
    const exists = state.categories.some(
      (c) =>
        c.floorId === body.floorId &&
        c.name.toLowerCase() === nameTrimmed.toLowerCase() &&
        c.isActive !== false
    );
    if (exists) {
      return [409, { message: `Category "${nameTrimmed}" already exists on this floor.` }];
    }
    if (!body.printerId) {
      return [400, { message: "A printer must be assigned to the category." }];
    }

    const floorCats = state.categories.filter((c) => c.floorId === body.floorId);
    const newCat: Category = {
      id: genId(),
      floorId: body.floorId,
      name: nameTrimmed,
      printerId: body.printerId,
      sortOrder: body.sortOrder ?? floorCats.length + 1,
      isActive: body.isActive !== undefined ? body.isActive : true,
    };
    state.categories.push(newCat);
    return [201, newCat];
  });

  mock.onPut(/\/categories\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/categories/")[1];
    const body = JSON.parse(config.data || "{}") as Partial<Category>;
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return [404, { message: "Category not found" }];

    if (body.name && body.name.trim().toLowerCase() !== cat.name.toLowerCase()) {
      const exists = state.categories.some(
        (c) =>
          c.id !== id &&
          c.floorId === cat.floorId &&
          c.name.toLowerCase() === body.name!.trim().toLowerCase() &&
          c.isActive !== false
      );
      if (exists) {
        return [409, { message: `Category "${body.name.trim()}" already exists on this floor.` }];
      }
    }

    Object.assign(cat, body);
    return [200, cat];
  });

  mock.onDelete(/\/categories\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/categories/")[1];
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return [404, { message: "Category not found" }];

    const activeItems = state.menuItems.filter((m) => m.categoryId === id && m.isActive !== false);
    if (activeItems.length > 0) {
      return [
        409,
        {
          message: `Cannot delete category "${cat.name}": ${activeItems.length} active item(s) belong to it. Please reassign or delete the items first.`,
        },
      ];
    }

    // If historical items exist in orders
    const hasOrderHistory = state.orders.some((o) =>
      o.items.some((item) => item.categoryId === id)
    );
    if (hasOrderHistory) {
      cat.isActive = false;
      return [
        200,
        {
          success: true,
          softDeleted: true,
          message: `Category "${cat.name}" has order history; deactivated instead of deleted.`,
        },
      ];
    }

    const idx = state.categories.findIndex((c) => c.id === id);
    if (idx >= 0) state.categories.splice(idx, 1);
    return [200, { success: true, softDeleted: false, message: `Category "${cat.name}" deleted.` }];
  });

  // ─── MENU ITEMS ───
  mock.onGet(/\/menu-items\?floorId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const floorId = url.searchParams.get("floorId");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    let items = state.menuItems.filter((m) => m.floorId === floorId);
    if (!includeInactive) {
      items = items.filter((m) => m.isActive !== false);
    }
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    return [200, items];
  });
  mock.onGet(/\/menu-items\?categoryId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const categoryId = url.searchParams.get("categoryId");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    let items = state.menuItems.filter((m) => m.categoryId === categoryId);
    if (!includeInactive) {
      items = items.filter((m) => m.isActive !== false);
    }
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    return [200, items];
  });
  mock.onGet("/menu-items").reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    if (!includeInactive) {
      return [200, state.menuItems.filter((m) => m.isActive !== false)];
    }
    return [200, state.menuItems];
  });

  // Toggle availability
  mock.onPatch(/\/menu-items\/[^?/]+\/availability/).reply((config) => {
    const id = config.url?.split("/menu-items/")[1]?.split("/")[0];
    const body = JSON.parse(config.data || "{}");
    const item = state.menuItems.find((m) => m.id === id);
    if (!item) return [404, { message: "Menu item not found" }];
    item.available = body.available !== undefined ? Boolean(body.available) : !item.available;
    return [200, item];
  });

  // Duplicate item (Task F7)
  mock.onPost(/\/menu-items\/[^?/]+\/duplicate/).reply((config) => {
    const id = config.url?.split("/menu-items/")[1]?.split("/")[0];
    const body = JSON.parse(config.data || "{}") as {
      targetFloorId: string;
      targetCategoryId: string;
    };
    const item = state.menuItems.find((m) => m.id === id);
    if (!item) return [404, { message: "Source menu item not found" }];

    const targetCat = state.categories.find(
      (c) => c.id === body.targetCategoryId && c.floorId === body.targetFloorId
    );
    if (!targetCat) {
      return [400, { message: "Target category does not exist on the target floor." }];
    }

    const catItems = state.menuItems.filter((m) => m.categoryId === body.targetCategoryId);
    const clonedItem: MenuItem = {
      ...item,
      id: genId(),
      floorId: body.targetFloorId,
      categoryId: body.targetCategoryId,
      sortOrder: catItems.length + 1,
      isActive: true,
      available: item.available,
    };
    state.menuItems.push(clonedItem);
    return [201, clonedItem];
  });

  // Reorder menu items (Task F7)
  mock.onPost("/menu-items/reorder").reply((config) => {
    const body = JSON.parse(config.data || "{}") as { categoryId: string; orderedIds: string[] };
    const { categoryId, orderedIds } = body;
    if (!categoryId || !Array.isArray(orderedIds)) {
      return [400, { message: "categoryId and orderedIds array are required." }];
    }
    orderedIds.forEach((id, index) => {
      const item = state.menuItems.find((m) => m.id === id && m.categoryId === categoryId);
      if (item) item.sortOrder = index + 1;
    });
    const updated = state.menuItems
      .filter((m) => m.categoryId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return [200, updated];
  });

  mock.onGet(/\/menu-items\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/menu-items/")[1];
    const item = state.menuItems.find((m) => m.id === id);
    if (!item) return [404, { message: "Menu item not found" }];
    return [200, item];
  });

  mock.onPost("/menu-items").reply((config) => {
    const body = JSON.parse(config.data || "{}") as Partial<MenuItem>;
    if (!body.name?.trim() || !body.floorId || !body.categoryId || body.price === undefined) {
      return [400, { message: "name, floorId, categoryId, and price are required." }];
    }
    const catItems = state.menuItems.filter((m) => m.categoryId === body.categoryId);
    const newItem: MenuItem = {
      id: genId(),
      floorId: body.floorId,
      categoryId: body.categoryId,
      name: body.name.trim(),
      price: Number(body.price),
      image: body.image,
      description: body.description,
      available: body.available !== undefined ? body.available : true,
      isActive: body.isActive !== undefined ? body.isActive : true,
      sortOrder: body.sortOrder ?? catItems.length + 1,
    };
    state.menuItems.push(newItem);
    return [201, newItem];
  });

  mock.onPut(/\/menu-items\/.+/).reply((config) => {
    const id = config.url?.split("/menu-items/")[1];
    const body = JSON.parse(config.data || "{}") as Partial<MenuItem>;
    const item = state.menuItems.find((m) => m.id === id);
    if (!item) return [404, { message: "Menu item not found" }];
    Object.assign(item, body);
    return [200, item];
  });

  mock.onDelete(/\/menu-items\/.+/).reply((config) => {
    const id = config.url?.split("/menu-items/")[1];
    const item = state.menuItems.find((m) => m.id === id);
    if (!item) return [404, { message: "Menu item not found" }];

    const hasOrderHistory = state.orders.some((o) =>
      o.items.some((i) => i.menuItemId === id)
    );
    if (hasOrderHistory) {
      item.isActive = false;
      return [
        200,
        {
          success: true,
          softDeleted: true,
          message: `Item "${item.name}" is part of order history; deactivated instead of deleted.`,
        },
      ];
    }

    const idx = state.menuItems.findIndex((m) => m.id === id);
    if (idx >= 0) state.menuItems.splice(idx, 1);
    return [200, { success: true, softDeleted: false, message: `Item "${item.name}" deleted.` }];
  });

  // ─── PRINTERS ───
  mock.onGet("/printers").reply(() => [200, state.printers]);

  mock.onPost(/\/printers\/[^?/]+\/test/).reply((config) => {
    const id = config.url?.split("/printers/")[1]?.split("/")[0];
    const printer = state.printers.find((p) => p.id === id);
    if (!printer) return [404, { status: "failed", message: "Printer not found" }];

    if (getMockFailedPrinterId() === id) {
      return [
        200,
        {
          status: "failed",
          message: `Network timeout: could not reach printer at ${printer.ip}:${printer.port}. Check device power and IP assignment.`,
        },
      ];
    }
    return [
      200,
      {
        status: "ok",
        message: `Test print slip successfully sent to ${printer.name} (${printer.ip}:${printer.port}).`,
      },
    ];
  });

  mock.onGet(/\/printers\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/printers/")[1];
    const printer = state.printers.find((p) => p.id === id);
    if (!printer) return [404, { message: "Printer not found" }];
    return [200, printer];
  });

  mock.onPost("/printers").reply((config) => {
    const body = JSON.parse(config.data || "{}") as Partial<Printer>;
    if (!body.name?.trim() || !body.ip?.trim()) {
      return [400, { message: "Printer name and IP address are required." }];
    }
    const nameTrimmed = body.name.trim();
    const nameExists = state.printers.some(
      (p) => p.name.toLowerCase() === nameTrimmed.toLowerCase()
    );
    if (nameExists) {
      return [409, { message: `A printer named "${nameTrimmed}" already exists.` }];
    }
    const ipPortExists = state.printers.some(
      (p) => p.ip === body.ip && p.port === (body.port || 9100)
    );
    if (ipPortExists) {
      return [
        409,
        { message: `A printer with address ${body.ip}:${body.port || 9100} already exists.` },
      ];
    }

    const newPrinter: Printer = {
      id: genId(),
      name: nameTrimmed,
      ip: body.ip.trim(),
      port: body.port ? Number(body.port) : 9100,
      isActive: body.isActive !== undefined ? body.isActive : true,
      role: body.role || "kitchen",
    };
    state.printers.push(newPrinter);
    return [201, newPrinter];
  });

  mock.onPut(/\/printers\/.+/).reply((config) => {
    const id = config.url?.split("/printers/")[1];
    const body = JSON.parse(config.data || "{}") as Partial<Printer>;
    const printer = state.printers.find((p) => p.id === id);
    if (!printer) return [404, { message: "Printer not found" }];

    if (body.name && body.name.trim().toLowerCase() !== printer.name.toLowerCase()) {
      const nameExists = state.printers.some(
        (p) => p.id !== id && p.name.toLowerCase() === body.name!.trim().toLowerCase()
      );
      if (nameExists) {
        return [409, { message: `A printer named "${body.name.trim()}" already exists.` }];
      }
    }
    if (
      (body.ip && body.ip !== printer.ip) ||
      (body.port !== undefined && body.port !== printer.port)
    ) {
      const newIp = body.ip || printer.ip;
      const newPort = body.port !== undefined ? body.port : printer.port;
      const ipPortExists = state.printers.some(
        (p) => p.id !== id && p.ip === newIp && p.port === newPort
      );
      if (ipPortExists) {
        return [409, { message: `A printer with address ${newIp}:${newPort} already exists.` }];
      }
    }

    Object.assign(printer, body);
    return [200, printer];
  });

  mock.onDelete(/\/printers\/.+/).reply((config) => {
    const id = config.url?.split("/printers/")[1];
    const printer = state.printers.find((p) => p.id === id);
    if (!printer) return [404, { message: "Printer not found" }];

    const usedCategories = state.categories.filter(
      (c) => c.printerId === id && c.isActive !== false
    );
    if (usedCategories.length > 0) {
      return [
        409,
        {
          message: `Cannot delete printer "${printer.name}": it is assigned to ${usedCategories.length} active category(ies) (${usedCategories.map((c) => c.name).join(", ")}). Reassign these categories before deleting.`,
        },
      ];
    }

    const idx = state.printers.findIndex((p) => p.id === id);
    if (idx >= 0) state.printers.splice(idx, 1);
    return [200, { success: true, softDeleted: false, message: `Printer "${printer.name}" deleted.` }];
  });

  // ─── UPLOADS ───
  mock.onPost("/uploads/image").reply(() => {
    return [
      200,
      {
        url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop",
      },
    ];
  });

  // ─── ORDERS ───
  mock.onGet(/\/menu\?floorId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const floorId = url.searchParams.get("floorId");
    const categories = state.categories
      .filter((c) => c.floorId === floorId && c.isActive !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const activeCategoryIds = new Set(categories.map((c) => c.id));
    const items = state.menuItems.filter(
      (m) =>
        m.floorId === floorId &&
        m.isActive !== false &&
        activeCategoryIds.has(m.categoryId)
    );
    return [200, { categories, items }];
  });

  mock.onGet(/\/orders\/open\?tableId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const tableId = url.searchParams.get("tableId");
    const order = state.orders.find((o) => o.tableId === tableId && o.status === "open") || null;
    return [200, order];
  });

  mock.onGet(/\/orders\?tableId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const tableId = url.searchParams.get("tableId");
    return [200, state.orders.filter((o) => o.tableId === tableId)];
  });
  mock.onGet(/\/orders\?floorId=.+/).reply((config) => {
    const url = new URL(config.url || "", "http://localhost");
    const floorId = url.searchParams.get("floorId");
    return [200, state.orders.filter((o) => o.floorId === floorId)];
  });
  mock.onGet("/orders").reply(() => [200, state.orders]);
  mock.onGet(/\/orders\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/orders/")[1]?.split("/")[0];
    const order = state.orders.find((o) => o.id === id);
    if (!order) return [404, { message: "Order not found" }];
    return [200, order];
  });

  // Create order
  mock.onPost("/orders").reply((config) => {
    const body = JSON.parse(config.data || "{}") as { tableId: string; floorId: string; waiterId: string };
    const newOrder: Order = {
      id: genId(),
      tableId: body.tableId,
      floorId: body.floorId,
      waiterId: body.waiterId,
      status: "open",
      items: [],
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      createdAt: new Date().toISOString(),
    };
    state.orders.push(newOrder);
    const table = state.tables.find((t) => t.id === body.tableId);
    if (table) {
      table.status = "occupied";
      table.currentOrderId = newOrder.id;
    }
    return [201, newOrder];
  });

  // Send items to kitchen (F5 endpoint)
  mock.onPost("/orders/send").reply((config) => {
    const body = JSON.parse(config.data || "{}") as SendItemsPayload;
    const { tableId, requestId, items } = body;

    // Idempotency: return existing result if requestId already processed
    if (idempotentSendResults.has(requestId)) {
      return [200, idempotentSendResults.get(requestId)];
    }

    const table = state.tables.find((t) => t.id === tableId);
    if (!table) return [404, { message: "Table not found" }];

    let order = state.orders.find((o) => o.tableId === tableId && o.status === "open");
    let batchNo = 1;

    if (!order) {
      order = {
        id: genId(),
        tableId,
        floorId: table.floorId,
        waiterId: "u2",
        status: "open",
        items: [],
        subtotal: 0,
        tax: 0,
        discount: 0,
        total: 0,
        createdAt: new Date().toISOString(),
      };
      state.orders.push(order);
      table.status = "occupied";
      table.currentOrderId = order.id;
      table.openedAt = new Date().toISOString();
    } else {
      batchNo = Math.max(0, ...order.items.map((i) => i.batchNo)) + 1;
    }

    const nowIso = new Date().toISOString();
    const newItems: OrderItem[] = items.map((draft) => {
      const menuItem = state.menuItems.find((m) => m.id === draft.menuItemId);
      return {
        id: genId(),
        menuItemId: draft.menuItemId,
        name: menuItem ? menuItem.name : "Custom Dish",
        price: menuItem ? menuItem.price : 0,
        qty: draft.qty,
        note: draft.note,
        batchNo,
        sentAt: nowIso,
        categoryId: menuItem ? menuItem.categoryId : "c1",
      };
    });

    order.items.push(...newItems);
    order.subtotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
    order.tax = order.subtotal * TAX_RATE;
    order.total = order.subtotal + order.tax - order.discount;
    table.runningTotal = order.total;

    // Generate print jobs per category
    const categoriesInBatch = Array.from(new Set(newItems.map((i) => i.categoryId)));
    const printJobs: PrintJob[] = categoriesInBatch.map((catId) => {
      const category = state.categories.find((c) => c.id === catId);
      const printer = state.printers.find((p) => p.id === category?.printerId);
      const isFailed = getMockFailedPrinterId() === (printer?.id || "") || getMockFailedPrinterId() === "ALL";
      return {
        categoryId: catId,
        categoryName: category?.name || "Kitchen",
        printerId: printer?.id || "p1",
        printerName: printer?.name || "Kitchen Printer",
        status: isFailed ? "failed" : "printed",
        error: isFailed ? "Printer offline / connection refused" : undefined,
      };
    });

    const sendResult: SendResult = {
      order: { ...order, items: [...order.items] },
      batchNo,
      printJobs,
    };

    idempotentSendResults.set(requestId, sendResult);
    return [200, sendResult];
  });

  // Reprint kitchen slip
  mock.onPost("/orders/reprint").reply((config) => {
    const body = JSON.parse(config.data || "{}") as { orderId: string; batchNo: number; categoryId: string };
    const category = state.categories.find((c) => c.id === body.categoryId);
    const printer = state.printers.find((p) => p.id === category?.printerId);
    const isFailed = getMockFailedPrinterId() === (printer?.id || "") || getMockFailedPrinterId() === "ALL";
    const job: PrintJob = {
      categoryId: body.categoryId,
      categoryName: category?.name || "Kitchen",
      printerId: printer?.id || "p1",
      printerName: printer?.name || "Kitchen Printer",
      status: isFailed ? "failed" : "printed",
      error: isFailed ? "Printer still unreachable" : undefined,
    };
    return [200, job];
  });

  // Dev endpoints for mock printer failure simulation
  mock.onGet("/mock/failed-printer").reply(() => [200, { printerId: getMockFailedPrinterId() }]);
  mock.onPost("/mock/failed-printer").reply((config) => {
    const parsed = JSON.parse(config.data || "{}");
    setMockFailedPrinterId(parsed.printerId ?? null);
    return [200, { printerId: getMockFailedPrinterId() }];
  });

  // Legacy send items to kitchen
  mock.onPost(/\/orders\/[^/]+\/send/).reply((config) => {
    const orderId = config.url?.split("/orders/")[1]?.split("/")[0];
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return [404, { message: "Order not found" }];
    const body = JSON.parse(config.data || "{}") as SendItemsPayload;
    const batchNo = Math.max(0, ...order.items.map((i) => i.batchNo)) + 1;
    const newItems: OrderItem[] = body.items.map((item) => {
      const menuItem = state.menuItems.find((m) => m.id === item.menuItemId);
      return {
        id: genId(),
        menuItemId: item.menuItemId,
        name: menuItem?.name || "Dish",
        price: menuItem?.price || 0,
        qty: item.qty,
        note: item.note,
        batchNo,
        sentAt: new Date().toISOString(),
        categoryId: menuItem?.categoryId || "cat-1",
      };
    });
    order.items.push(...newItems);
    const taxRate = 0.05;
    order.subtotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
    order.tax = order.subtotal * taxRate;
    order.total = order.subtotal + order.tax - order.discount;

    // Ensure table is marked occupied and tied to this order
    const table = state.tables.find((t) => t.id === order.tableId);
    if (table) {
      table.status = "occupied";
      table.currentOrderId = order.id;
    }
    return [200, order];
  });

  function getCurrentUser(config: { headers?: unknown }, state: MockState): User | undefined {
    const headers = (config.headers || {}) as Record<string, unknown>;
    const authHeader = (headers["Authorization"] || headers["authorization"]) as string | undefined;
    const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : "";
    if (!token) return undefined;
    const userId = token.replace("mock-token-", "");
    return state.users.find((u) => u.id === userId);
  }

  // ─── PAY ORDER (Task F6) ───
  mock.onPost(/\/orders\/[^/]+\/pay/).reply((config) => {
    const orderId = config.url?.split("/orders/")[1]?.split("/")[0];
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return [404, { message: "Order not found" }];

    const body = JSON.parse(config.data || "{}") as PayRequest;

    // 1. Idempotency check
    if (body.requestId && idempotentPayResults.has(body.requestId)) {
      return [200, idempotentPayResults.get(body.requestId)!];
    }

    // 2. Already paid check
    if (order.status === "paid") {
      return [409, { message: "Order already paid" }];
    }

    // 3. Validation: Must have at least 1 non-voided item
    const activeItems = order.items.filter((i) => !i.voided);
    if (activeItems.length === 0) {
      return [422, { message: "Cannot pay an order with no active items" }];
    }

    const currentUser = getCurrentUser(config, state);

    // 4. Calculate financial totals
    const subtotal = activeItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    const serviceCharge = Math.round(subtotal * SERVICE_CHARGE_RATE * 100) / 100;
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;

    let discount = 0;
    if (body.discountType === "percent") {
      const pct = Math.min(100, Math.max(0, body.discountValue || 0));
      discount = Math.round(((subtotal * pct) / 100) * 100) / 100;
    } else if (body.discountType === "amount") {
      discount = Math.min(subtotal, Math.max(0, body.discountValue || 0));
    } else if ((body as unknown as { discount?: number }).discount !== undefined) {
      discount = (body as unknown as { discount: number }).discount;
    }

    const total = Math.max(0, Math.round((subtotal + serviceCharge + tax - discount) * 100) / 100);

    // 5. Cash payment validation
    const method = body.method || "cash";
    let amountReceived = body.amountReceived;
    let changeDue = 0;

    if (method === "cash") {
      if (amountReceived === undefined || amountReceived < total) {
        return [
          422,
          {
            message: `Amount received must be at least ${total.toFixed(2)}`,
          },
        ];
      }
      changeDue = Math.round((amountReceived - total) * 100) / 100;
    } else {
      amountReceived = total;
      changeDue = 0;
    }

    // 6. Assign daily bill sequence
    dailyBillSeq += 1;
    const billNo = `B-${String(dailyBillSeq).padStart(4, "0")}`;

    // 7. Update order
    order.status = "paid";
    order.billNo = billNo;
    order.paymentMethod = method;
    order.subtotal = subtotal;
    order.serviceCharge = serviceCharge;
    order.tax = tax;
    order.discount = discount;
    order.discountType = body.discountType;
    order.discountValue = body.discountValue;
    order.total = total;
    order.amountReceived = amountReceived;
    order.changeDue = changeDue;
    order.paidAt = new Date().toISOString();
    order.paidBy = currentUser?.id || "u2";

    // 8. Free table
    const table = state.tables.find((t) => t.id === order.tableId);
    if (table) {
      table.status = "free";
      table.currentOrderId = undefined;
      table.runningTotal = 0;
      table.openedAt = undefined;
    }

    // 9. Generate PrintJob for Cashier Printer
    const isCashierFailed = getMockFailedPrinterId() === CASHIER_PRINTER_ID;
    const billPrintJob: PrintJob = {
      categoryId: "cashier",
      categoryName: "Cashier",
      printerId: CASHIER_PRINTER_ID,
      printerName: "Cashier Thermal Printer (192.168.1.103)",
      status: isCashierFailed ? "failed" : "printed",
      error: isCashierFailed
        ? "Cashier printer offline or out of paper"
        : undefined,
    };

    const payResult: PayResult = {
      order,
      billPrintJob,
      table: table ? { ...table } : ({} as Table),
    };

    if (body.requestId) {
      idempotentPayResults.set(body.requestId, payResult);
    }

    return [200, payResult];
  });

  // ─── REPRINT BILL (Task F6) ───
  mock.onPost(/\/orders\/[^/]+\/reprint-bill/).reply((config) => {
    const orderId = config.url?.split("/orders/")[1]?.split("/")[0];
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return [404, { message: "Order not found" }];
    if (order.status !== "paid") {
      return [400, { message: "Cannot reprint bill for unpaid order" }];
    }

    const isCashierFailed = getMockFailedPrinterId() === CASHIER_PRINTER_ID;
    const printJob: PrintJob = {
      categoryId: "cashier",
      categoryName: "Cashier",
      printerId: CASHIER_PRINTER_ID,
      printerName: "Cashier Thermal Printer (192.168.1.103)",
      status: isCashierFailed ? "failed" : "printed",
      error: isCashierFailed
        ? "Cashier printer offline or out of paper"
        : undefined,
    };
    return [200, printJob];
  });

  // ─── VOID / CANCEL ITEM (Task F6 - Admin Only) ───
  mock.onPost(/\/orders\/[^/]+\/void-item/).reply((config) => {
    const orderId = config.url?.split("/orders/")[1]?.split("/")[0];
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return [404, { message: "Order not found" }];

    // Role check: Admin only
    const user = getCurrentUser(config, state);
    if (user && user.role !== "admin") {
      return [403, { message: "Admin access required to cancel order items" }];
    }

    const body = JSON.parse(config.data || "{}") as VoidItemRequest;

    if (body.requestId && idempotentVoidResults.has(body.requestId)) {
      return [200, idempotentVoidResults.get(body.requestId)!];
    }

    const item = order.items.find((i) => i.id === body.orderItemId);
    if (!item) return [404, { message: "Order item not found" }];
    if (item.voided) {
      return [400, { message: "Item is already cancelled" }];
    }

    // Mark item voided
    item.voided = true;
    item.voidReason = body.reason || "Customer cancelled";
    item.voidedAt = new Date().toISOString();
    item.voidedBy = user?.name || "Admin";

    // Recalculate order totals
    const activeItems = order.items.filter((i) => !i.voided);
    order.subtotal = activeItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    order.tax = Math.round(order.subtotal * TAX_RATE * 100) / 100;
    order.total = Math.max(0, order.subtotal + (order.serviceCharge || 0) + order.tax - order.discount);

    // Update table running total
    const table = state.tables.find((t) => t.id === order.tableId);
    if (table) {
      table.runningTotal = order.total;
    }

    // CANCELLED slip print job to kitchen station
    const cat = state.categories.find((c) => c.id === item.categoryId);
    const prn =
      state.printers.find((p) => p.id === cat?.printerId) || {
        id: "p1",
        name: "Kitchen Printer",
      };

    const isPrinterFailed = getMockFailedPrinterId() === prn.id;
    const printJob: PrintJob = {
      categoryId: item.categoryId,
      categoryName: cat?.name || "Kitchen",
      printerId: prn.id,
      printerName: prn.name,
      status: isPrinterFailed ? "failed" : "printed",
      error: isPrinterFailed ? `${prn.name} printer offline` : undefined,
    };

    const result: VoidItemResult = {
      order,
      printJob,
    };

    if (body.requestId) {
      idempotentVoidResults.set(body.requestId, result);
    }

    return [200, result];
  });

  // ─── LIST PAID BILLS (Task F6) ───
  mock.onGet("/orders/paid").reply((config) => {
    const params = config.params || {};
    let paidOrders = state.orders.filter((o) => o.status === "paid");

    // Filter by date (YYYY-MM-DD)
    if (params.date) {
      paidOrders = paidOrders.filter((o) =>
        o.paidAt ? o.paidAt.startsWith(params.date) : false
      );
    }

    // Filter by floor
    if (params.floorId) {
      paidOrders = paidOrders.filter((o) => o.floorId === params.floorId);
    }

    // Filter by payment method
    if (params.paymentMethod) {
      paidOrders = paidOrders.filter(
        (o) => o.paymentMethod === params.paymentMethod
      );
    }

    // Search by bill number or table number
    if (params.search) {
      const q = String(params.search).toLowerCase().trim();
      paidOrders = paidOrders.filter((o) => {
        const matchesBill = o.billNo?.toLowerCase().includes(q);
        const table = state.tables.find((t) => t.id === o.tableId);
        const matchesTable = table ? String(table.number).includes(q) : false;
        return matchesBill || matchesTable;
      });
    }

    // Sort newest first
    paidOrders.sort((a, b) => {
      const timeA = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const timeB = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return timeB - timeA;
    });

    const totalAmount = paidOrders.reduce((sum, o) => sum + o.total, 0);
    const total = paidOrders.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const start = (page - 1) * limit;
    const items = paidOrders.slice(start, start + limit);

    return [
      200,
      {
        items,
        total,
        page,
        limit,
        totalAmount,
      },
    ];
  });

  // Cancel order
  mock.onPost(/\/orders\/[^/]+\/cancel/).reply((config) => {
    const orderId = config.url?.split("/orders/")[1]?.split("/")[0];
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return [404, { message: "Order not found" }];
    order.status = "cancelled";
    const table = state.tables.find((t) => t.id === order.tableId);
    if (table) {
      table.status = "free";
      table.currentOrderId = undefined;
    }
    return [200, order];
  });

  // ─── REPORTS ───
  mock.onGet("/reports/daily-sales").reply(() => {
    const today = new Date().toISOString().split("T")[0];
    const paidOrders = state.orders.filter((o) => o.status === "paid");
    return [200, [{
      date: today,
      totalSales: paidOrders.reduce((s, o) => s + o.total, 0),
      totalOrders: paidOrders.length,
      totalTax: paidOrders.reduce((s, o) => s + o.tax, 0),
    }]];
  });

  mock.onGet("/reports/category-sales").reply(() => {
    const results = state.categories.map((cat) => {
      const itemIds = state.menuItems.filter((m) => m.categoryId === cat.id).map((m) => m.id);
      const paidOrders = state.orders.filter((o) => o.status === "paid");
      let totalSales = 0;
      let itemCount = 0;
      paidOrders.forEach((o) => {
        o.items.forEach((oi) => {
          if (itemIds.includes(oi.menuItemId)) {
            totalSales += oi.price * oi.qty;
            itemCount += oi.qty;
          }
        });
      });
      return { categoryId: cat.id, categoryName: cat.name, totalSales, itemCount };
    });
    return [200, results];
  });

  mock.onGet("/reports/top-items").reply(() => {
    const itemMap: Record<string, { menuItemId: string; name: string; totalQty: number; totalRevenue: number }> = {};
    const paidOrders = state.orders.filter((o) => o.status === "paid");
    paidOrders.forEach((o) => {
      o.items.forEach((oi) => {
        if (!itemMap[oi.menuItemId]) {
          itemMap[oi.menuItemId] = { menuItemId: oi.menuItemId, name: oi.name, totalQty: 0, totalRevenue: 0 };
        }
        itemMap[oi.menuItemId].totalQty += oi.qty;
        itemMap[oi.menuItemId].totalRevenue += oi.price * oi.qty;
      });
    });
    const sorted = Object.values(itemMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 10);
    return [200, sorted];
  });

  mock.onGet("/reports/waiter-sales").reply(() => {
    const waiterMap: Record<string, { waiterId: string; waiterName: string; totalSales: number; totalOrders: number }> = {};
    const paidOrders = state.orders.filter((o) => o.status === "paid");
    paidOrders.forEach((o) => {
      if (!waiterMap[o.waiterId]) {
        const user = state.users.find((u) => u.id === o.waiterId);
        waiterMap[o.waiterId] = { waiterId: o.waiterId, waiterName: user?.name || "Unknown", totalSales: 0, totalOrders: 0 };
      }
      waiterMap[o.waiterId].totalSales += o.total;
      waiterMap[o.waiterId].totalOrders += 1;
    });
    return [200, Object.values(waiterMap)];
  });

  // ─── USERS ───
  mock.onGet("/users").reply(() => [200, state.users]);
  mock.onGet(/\/users\/[^?/]+$/).reply((config) => {
    const id = config.url?.split("/users/")[1];
    const user = state.users.find((u) => u.id === id);
    if (!user) return [404, { message: "User not found" }];
    return [200, user];
  });
  mock.onPost("/users").reply((config) => {
    const body = JSON.parse(config.data || "{}");
    const { password: _pw, ...userData } = body;
    const newUser = { ...userData, id: genId() };
    state.users.push(newUser);
    return [201, newUser];
  });
  mock.onPut(/\/users\/.+/).reply((config) => {
    const id = config.url?.split("/users/")[1];
    const body = JSON.parse(config.data || "{}");
    const user = state.users.find((u) => u.id === id);
    if (!user) return [404, { message: "User not found" }];
    Object.assign(user, body);
    return [200, user];
  });
  mock.onDelete(/\/users\/.+/).reply((config) => {
    const id = config.url?.split("/users/")[1];
    const idx = state.users.findIndex((c) => c.id === id);
    if (idx < 0) return [404, { message: "User not found" }];
    state.users.splice(idx, 1);
    return [204, null];
  });

  // ─── REPORTS ───
  // Helper to filter orders by date range and optional filters
  function filterOrders(config: { params?: Record<string, string> }) {
    const p = config.params || {};
    const from = p.from ? new Date(p.from + "T00:00:00+05:00") : new Date(0);
    const to = p.to ? new Date(p.to + "T23:59:59+05:00") : new Date();
    const floorId = p.floorId;
    const waiterId = p.waiterId;
    const paymentMethod = p.paymentMethod;
    const categoryId = p.categoryId;

    return state.orders.filter((o) => {
      if (o.status !== "paid" || !o.paidAt) return false;
      const paid = new Date(o.paidAt);
      if (paid < from || paid > to) return false;
      if (floorId && floorId !== "all" && o.floorId !== floorId) return false;
      if (waiterId && o.waiterId !== waiterId) return false;
      if (paymentMethod && o.paymentMethod !== paymentMethod) return false;
      if (categoryId && !o.items.some((i) => i.categoryId === categoryId)) return false;
      return true;
    });
  }

  function calcMetrics(orders: typeof state.orders) {
    let grossSales = 0;
    let discounts = 0;
    let tax = 0;
    let serviceCharge = 0;
    let itemsSold = 0;
    let voidedItemsCount = 0;
    let voidedAmount = 0;

    for (const o of orders) {
      grossSales += o.subtotal;
      discounts += o.discount || 0;
      tax += o.tax || 0;
      serviceCharge += o.serviceCharge || 0;
      for (const item of o.items) {
        if (item.voided) {
          voidedItemsCount++;
          voidedAmount += item.price * item.qty;
        } else {
          itemsSold += item.qty;
        }
      }
    }

    const netSales = grossSales - discounts;
    const grandTotal = netSales + tax + serviceCharge;
    const billsCount = orders.length;
    const avgBill = billsCount > 0 ? grandTotal / billsCount : 0;

    return { grossSales, discounts, netSales, tax, serviceCharge, grandTotal, billsCount, itemsSold, avgBill, voidedItemsCount, voidedAmount };
  }

  function reportDelay(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  mock.onGet("/reports/summary").reply(async (config) => {
    await reportDelay(500);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });

    // Previous period: same length before the from date
    const from = new Date(p.from + "T00:00:00+05:00");
    const to = new Date(p.to + "T23:59:59+05:00");
    const rangeMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - rangeMs - 86400000);
    const prevTo = new Date(from.getTime() - 1);

    const prevOrders = state.orders.filter((o) => {
      if (o.status !== "paid" || !o.paidAt) return false;
      const paid = new Date(o.paidAt);
      return paid >= prevFrom && paid <= prevTo;
    });

    const current = calcMetrics(orders);
    const previous = calcMetrics(prevOrders);

    const changePercent: Record<string, number> = {};
    for (const key of Object.keys(current) as (keyof typeof current)[]) {
      const curr = current[key];
      const prev = previous[key];
      if (typeof curr === "number" && typeof prev === "number") {
        changePercent[key] = prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
      }
    }

    return [200, {
      ...current,
      comparison: { previousPeriod: previous, changePercent },
    }];
  });

  mock.onGet("/reports/sales-over-time").reply(async (config) => {
    await reportDelay(500);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });
    const from = new Date(p.from + "T00:00:00+05:00");
    const to = new Date(p.to + "T23:59:59+05:00");
    const diffDays = (to.getTime() - from.getTime()) / 86400000;

    let groupBy = p.groupBy as "hour" | "day" | "month";
    if (!groupBy) {
      groupBy = diffDays <= 1 ? "hour" : diffDays <= 62 ? "day" : "month";
    }

    const buckets = new Map<string, { grandTotal: number; billsCount: number; netSales: number }>();

    for (const o of orders) {
      const paidDate = new Date(o.paidAt!);
      let bucket: string;
      if (groupBy === "hour") {
        bucket = `${paidDate.toISOString().slice(0, 13)}:00`;
      } else if (groupBy === "day") {
        bucket = paidDate.toISOString().slice(0, 10);
      } else {
        bucket = paidDate.toISOString().slice(0, 7);
      }

      const existing = buckets.get(bucket) || { grandTotal: 0, billsCount: 0, netSales: 0 };
      existing.grandTotal += o.total;
      existing.billsCount += 1;
      existing.netSales += o.total - (o.tax || 0) - (o.serviceCharge || 0);
      buckets.set(bucket, existing);
    }

    const result = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, v]) => ({ bucket, ...v }));

    return [200, result];
  });

  mock.onGet("/reports/by-category").reply(async (config) => {
    await reportDelay(400);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });

    const catMap = new Map<string, { qty: number; amount: number }>();
    let totalAmount = 0;

    for (const o of orders) {
      for (const item of o.items) {
        if (item.voided) continue;
        const e = catMap.get(item.categoryId) || { qty: 0, amount: 0 };
        e.qty += item.qty;
        e.amount += item.price * item.qty;
        catMap.set(item.categoryId, e);
        totalAmount += item.price * item.qty;
      }
    }

    const result = Array.from(catMap.entries()).map(([catId, v]) => {
      const cat = state.categories.find((c) => c.id === catId);
      return {
        categoryId: catId,
        name: cat?.name || catId,
        floorId: cat?.floorId || "",
        qty: v.qty,
        amount: v.amount,
        sharePercent: totalAmount > 0 ? (v.amount / totalAmount) * 100 : 0,
      };
    }).sort((a, b) => b.amount - a.amount);

    return [200, result];
  });

  mock.onGet("/reports/by-floor").reply(async (config) => {
    await reportDelay(400);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });

    const floorMap = new Map<string, { billsCount: number; grandTotal: number }>();
    for (const o of orders) {
      const e = floorMap.get(o.floorId) || { billsCount: 0, grandTotal: 0 };
      e.billsCount += 1;
      e.grandTotal += o.total;
      floorMap.set(o.floorId, e);
    }

    const result = Array.from(floorMap.entries()).map(([floorId, v]) => {
      const floor = state.floors.find((f) => f.id === floorId);
      return {
        floorId,
        name: floor?.name || floorId,
        billsCount: v.billsCount,
        grandTotal: v.grandTotal,
        avgBill: v.billsCount > 0 ? v.grandTotal / v.billsCount : 0,
      };
    }).sort((a, b) => b.grandTotal - a.grandTotal);

    return [200, result];
  });

  mock.onGet("/reports/by-waiter").reply(async (config) => {
    await reportDelay(400);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });

    const waiterMap = new Map<string, { billsCount: number; itemsSold: number; grandTotal: number }>();
    let total = 0;
    for (const o of orders) {
      const e = waiterMap.get(o.waiterId) || { billsCount: 0, itemsSold: 0, grandTotal: 0 };
      e.billsCount += 1;
      e.grandTotal += o.total;
      e.itemsSold += o.items.filter((i) => !i.voided).reduce((s, i) => s + i.qty, 0);
      waiterMap.set(o.waiterId, e);
      total += o.total;
    }

    const result = Array.from(waiterMap.entries()).map(([waiterId, v]) => {
      const user = state.users.find((u) => u.id === waiterId);
      return {
        waiterId,
        name: user?.name || waiterId,
        billsCount: v.billsCount,
        itemsSold: v.itemsSold,
        grandTotal: v.grandTotal,
        avgBill: v.billsCount > 0 ? v.grandTotal / v.billsCount : 0,
        sharePercent: total > 0 ? (v.grandTotal / total) * 100 : 0,
      };
    }).sort((a, b) => b.grandTotal - a.grandTotal);

    return [200, result];
  });

  mock.onGet("/reports/top-items").reply(async (config) => {
    await reportDelay(400);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });
    const sort = (p.sort as "qty" | "amount") || "amount";
    const order = (p.order as "asc" | "desc") || "desc";
    const limit = p.limit ? parseInt(p.limit, 10) : 20;

    const itemMap = new Map<string, { qty: number; amount: number }>();
    for (const o of orders) {
      for (const item of o.items) {
        if (item.voided) continue;
        const e = itemMap.get(item.menuItemId) || { qty: 0, amount: 0 };
        e.qty += item.qty;
        e.amount += item.price * item.qty;
        itemMap.set(item.menuItemId, e);
      }
    }

    const result = Array.from(itemMap.entries()).map(([menuItemId, v]) => {
      const mi = state.menuItems.find((m) => m.id === menuItemId);
      const cat = state.categories.find((c) => c.id === mi?.categoryId);
      return {
        menuItemId,
        name: mi?.name || menuItemId,
        categoryName: cat?.name || "",
        floorId: mi?.floorId || "",
        qty: v.qty,
        amount: v.amount,
      };
    });

    result.sort((a, b) => {
      const diff = a[sort] - b[sort];
      return order === "desc" ? -diff : diff;
    });

    return [200, result.slice(0, limit)];
  });

  mock.onGet("/reports/by-payment-method").reply(async (config) => {
    await reportDelay(400);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });

    const methodMap = new Map<string, { billsCount: number; amount: number }>();
    let total = 0;
    for (const o of orders) {
      const method = o.paymentMethod || "cash";
      const e = methodMap.get(method) || { billsCount: 0, amount: 0 };
      e.billsCount += 1;
      e.amount += o.total;
      methodMap.set(method, e);
      total += o.total;
    }

    const result = Array.from(methodMap.entries()).map(([method, v]) => ({
      method: method as "cash" | "card" | "online",
      billsCount: v.billsCount,
      amount: v.amount,
      sharePercent: total > 0 ? (v.amount / total) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);

    return [200, result];
  });

  mock.onGet("/reports/peak-hours").reply(async (config) => {
    await reportDelay(500);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });

    const cells = new Map<string, { billsCount: number; grandTotal: number }>();
    for (const o of orders) {
      const paidDate = new Date(o.paidAt!);
      const weekday = paidDate.getDay();
      const hour = paidDate.getHours();
      const key = `${weekday}-${hour}`;
      const e = cells.get(key) || { billsCount: 0, grandTotal: 0 };
      e.billsCount += 1;
      e.grandTotal += o.total;
      cells.set(key, e);
    }

    const result = Array.from(cells.entries()).map(([key, v]) => {
      const [weekday, hour] = key.split("-").map(Number);
      return { weekday, hour, ...v };
    });

    return [200, result];
  });

  mock.onGet("/reports/discounts").reply(async (config) => {
    await reportDelay(400);
    const p = (config.params as Record<string, string>) || {};
    const orders = filterOrders({ params: p });

    const result = orders
      .filter((o) => (o.discount || 0) > 0)
      .map((o) => {
        const tableNum = state.tables.find((t) => t.id === o.tableId)?.number || 0;
        const floor = state.floors.find((f) => f.id === o.floorId);
        const user = state.users.find((u) => u.id === o.waiterId);
        return {
          billNo: o.billNo || "",
          orderId: o.id,
          paidAt: o.paidAt || "",
          tableNumber: tableNum,
          floorName: floor?.name || o.floorId,
          waiterName: user?.name || o.waiterId,
          discountType: o.discountType || "amount",
          discountValue: o.discountValue || 0,
          discountAmount: o.discount || 0,
        };
      })
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

    return [200, result];
  });

  mock.onGet("/reports/voided-items").reply(async (config) => {
    await reportDelay(400);
    const p = (config.params as Record<string, string>) || {};
    // For voided items, include open orders too (void can happen before payment)
    const relevantOrders = state.orders.filter((o) => {
      if (o.paidAt) {
        const from = p.from ? new Date(p.from + "T00:00:00+05:00") : new Date(0);
        const to = p.to ? new Date(p.to + "T23:59:59+05:00") : new Date();
        const paidDate = new Date(o.paidAt);
        if (paidDate < from || paidDate > to) return false;
      }
      if (p.floorId && p.floorId !== "all" && o.floorId !== p.floorId) return false;
      return true;
    });

    const result: Array<{
      time: string; billNo?: string; orderId: string; tableNumber: number;
      floorName: string; itemName: string; qty: number; amount: number;
      reason: string; voidedBy: string;
    }> = [];

    for (const o of relevantOrders) {
      const tableNum = state.tables.find((t) => t.id === o.tableId)?.number || 0;
      const floor = state.floors.find((f) => f.id === o.floorId);
      for (const item of o.items) {
        if (!item.voided) continue;
        const voidUser = state.users.find((u) => u.id === item.voidedBy);
        result.push({
          time: item.voidedAt || o.paidAt || o.createdAt,
          billNo: o.billNo,
          orderId: o.id,
          tableNumber: tableNum,
          floorName: floor?.name || o.floorId,
          itemName: item.name,
          qty: item.qty,
          amount: item.price * item.qty,
          reason: item.voidReason || "No reason given",
          voidedBy: voidUser?.name || item.voidedBy || "Unknown",
        });
      }
    }

    result.sort((a, b) => b.time.localeCompare(a.time));
    return [200, result];
  });

  mock.onGet("/reports/daily-closing").reply(async (config) => {
    await reportDelay(600);
    const p = (config.params as Record<string, string>) || {};
    const date = p.date || new Date().toISOString().split("T")[0];
    const floorId = p.floorId;

    const dayOrders = state.orders.filter((o) => {
      if (o.status !== "paid" || !o.paidAt) return false;
      const paidDate = o.paidAt.slice(0, 10);
      if (paidDate !== date) return false;
      if (floorId && floorId !== "all" && o.floorId !== floorId) return false;
      return true;
    });

    const summary = calcMetrics(dayOrders);

    const paidTimes = dayOrders.map((o) => o.paidAt!).sort();
    const openedAt = paidTimes[0] || null;
    const closedAt = paidTimes[paidTimes.length - 1] || null;

    // Count open tables (unpaid orders) for this date
    const openOrders = state.orders.filter((o) => o.status === "open");
    const openTablesCount = openOrders.length;

    // by payment method
    const methodMap = new Map<string, { billsCount: number; amount: number }>();
    let totalAmt = 0;
    for (const o of dayOrders) {
      const m = o.paymentMethod || "cash";
      const e = methodMap.get(m) || { billsCount: 0, amount: 0 };
      e.billsCount++; e.amount += o.total;
      methodMap.set(m, e); totalAmt += o.total;
    }
    const byPaymentMethod = Array.from(methodMap.entries()).map(([method, v]) => ({
      method: method as "cash" | "card" | "online",
      billsCount: v.billsCount,
      amount: v.amount,
      sharePercent: totalAmt > 0 ? (v.amount / totalAmt) * 100 : 0,
    }));

    // by floor
    const floorMap = new Map<string, { billsCount: number; grandTotal: number }>();
    for (const o of dayOrders) {
      const e = floorMap.get(o.floorId) || { billsCount: 0, grandTotal: 0 };
      e.billsCount++; e.grandTotal += o.total;
      floorMap.set(o.floorId, e);
    }
    const byFloor = Array.from(floorMap.entries()).map(([fid, v]) => {
      const floor = state.floors.find((f) => f.id === fid);
      return { floorId: fid, name: floor?.name || fid, billsCount: v.billsCount, grandTotal: v.grandTotal, avgBill: v.billsCount > 0 ? v.grandTotal / v.billsCount : 0 };
    });

    // by category
    const catMap = new Map<string, { qty: number; amount: number }>();
    let catTotal = 0;
    for (const o of dayOrders) {
      for (const item of o.items) {
        if (item.voided) continue;
        const e = catMap.get(item.categoryId) || { qty: 0, amount: 0 };
        e.qty += item.qty; e.amount += item.price * item.qty;
        catMap.set(item.categoryId, e); catTotal += item.price * item.qty;
      }
    }
    const byCategory = Array.from(catMap.entries()).map(([catId, v]) => {
      const cat = state.categories.find((c) => c.id === catId);
      return { categoryId: catId, name: cat?.name || catId, floorId: cat?.floorId || "", qty: v.qty, amount: v.amount, sharePercent: catTotal > 0 ? (v.amount / catTotal) * 100 : 0 };
    }).sort((a, b) => b.amount - a.amount);

    // top 10 items
    const itemMap = new Map<string, { qty: number; amount: number }>();
    for (const o of dayOrders) {
      for (const item of o.items) {
        if (item.voided) continue;
        const e = itemMap.get(item.menuItemId) || { qty: 0, amount: 0 };
        e.qty += item.qty; e.amount += item.price * item.qty;
        itemMap.set(item.menuItemId, e);
      }
    }
    const topItems = Array.from(itemMap.entries()).map(([menuItemId, v]) => {
      const mi = state.menuItems.find((m) => m.id === menuItemId);
      const cat = state.categories.find((c) => c.id === mi?.categoryId);
      return { menuItemId, name: mi?.name || menuItemId, categoryName: cat?.name || "", floorId: mi?.floorId || "", qty: v.qty, amount: v.amount };
    }).sort((a, b) => b.amount - a.amount).slice(0, 10);

    const discountsTotal = dayOrders.reduce((s, o) => s + (o.discount || 0), 0);
    const voidedTotal = dayOrders.reduce((s, o) =>
      s + o.items.filter((i) => i.voided).reduce((ss, i) => ss + i.price * i.qty, 0), 0);

    return [200, {
      date,
      openedAt,
      closedAt,
      summary,
      byPaymentMethod,
      byFloor,
      byCategory,
      topItems,
      discountsTotal,
      voidedTotal,
      openTablesCount,
    }];
  });

  // Legacy report endpoints (backward compat)
  mock.onGet("/reports/daily-sales").reply(async () => {
    await reportDelay(400);
    const today = new Date().toISOString().split("T")[0];
    const todayOrders = state.orders.filter((o) => o.status === "paid" && o.paidAt?.startsWith(today));
    const totalSales = todayOrders.reduce((s, o) => s + o.total, 0);
    return [200, [{ date: today, totalSales, totalOrders: todayOrders.length, totalTax: 0 }]];
  });

  mock.onGet("/reports/category-sales").reply(async () => {
    await reportDelay(400);
    const catMap = new Map<string, { totalSales: number; itemCount: number }>();
    for (const o of state.orders.filter((o) => o.status === "paid")) {
      for (const item of o.items) {
        if (item.voided) continue;
        const e = catMap.get(item.categoryId) || { totalSales: 0, itemCount: 0 };
        e.totalSales += item.price * item.qty;
        e.itemCount += item.qty;
        catMap.set(item.categoryId, e);
      }
    }
    return [200, Array.from(catMap.entries()).map(([catId, v]) => {
      const cat = state.categories.find((c) => c.id === catId);
      return { categoryId: catId, categoryName: cat?.name || catId, ...v };
    })];
  });

  mock.onGet("/reports/waiter-sales").reply(async () => {
    await reportDelay(400);
    return [200, state.users
      .filter((u) => u.role === "waiter")
      .map((u) => ({
        waiterId: u.id,
        waiterName: u.name,
        totalSales: state.orders
          .filter((o) => o.status === "paid" && o.waiterId === u.id)
          .reduce((s, o) => s + o.total, 0),
        totalOrders: state.orders.filter((o) => o.status === "paid" && o.waiterId === u.id).length,
      }))];
  });
}
