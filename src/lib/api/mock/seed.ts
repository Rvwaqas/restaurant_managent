import type { Floor, Table, Category, MenuItem, Printer, User, Order } from "@/types";
import { getHistoricalOrders } from "./reportsSeed";

// ─── Floors ───
export const seedFloors: Floor[] = [
  { id: "f1", slug: "floor-1", name: "Floor 1 (Halal)", menuType: "halal" },
  { id: "f2", slug: "floor-2", name: "Floor 2 (Non-Halal)", menuType: "non-halal" },
];

// ─── Printers ───
export const seedPrinters: Printer[] = [
  { id: "p1", name: "Sweet Printer", ip: "192.168.1.100", port: 9100, isActive: true, role: "kitchen" },
  { id: "p2", name: "Spicy Printer", ip: "192.168.1.101", port: 9100, isActive: true, role: "kitchen" },
  { id: "p3", name: "Drinks Printer", ip: "192.168.1.102", port: 9100, isActive: true, role: "kitchen" },
  { id: "prn-cashier", name: "Cashier Thermal Printer", ip: "192.168.1.103", port: 9100, isActive: true, role: "cashier" },
];

// ─── Tables (10 per floor with ~30% realistic occupied state) ───
function makeTables(floorId: string, startNum: number): Table[] {
  const capacities = [2, 4, 4, 6, 2, 4, 8, 4, 6, 2];
  const now = Date.now();

  return Array.from({ length: 10 }, (_, i) => {
    const tableId = `${floorId}-t${i + 1}`;
    const tableNum = startNum + i;
    
    // Seed ~30% occupied tables (tables at index 2, 3, 7 on each floor)
    if (i === 2) {
      return {
        id: tableId,
        floorId,
        number: tableNum,
        capacity: capacities[i] || 4,
        status: "occupied" as const,
        isActive: true,
        currentOrderId: `mock-ord-${floorId}-t3`,
        runningTotal: 48.5,
        openedAt: new Date(now - 32 * 60 * 1000).toISOString(), // 32 mins ago
      };
    }
    if (i === 3) {
      return {
        id: tableId,
        floorId,
        number: tableNum,
        capacity: capacities[i] || 4,
        status: "occupied" as const,
        isActive: true,
        currentOrderId: `mock-ord-${floorId}-t4`,
        runningTotal: 124.0,
        openedAt: new Date(now - 74 * 60 * 1000).toISOString(), // 1h 14m ago
      };
    }
    if (i === 7) {
      return {
        id: tableId,
        floorId,
        number: tableNum,
        capacity: capacities[i] || 4,
        status: "occupied" as const,
        isActive: true,
        currentOrderId: `mock-ord-${floorId}-t8`,
        runningTotal: 18.0,
        openedAt: new Date(now - 12 * 60 * 1000).toISOString(), // 12 mins ago
      };
    }

    return {
      id: tableId,
      floorId,
      number: tableNum,
      capacity: capacities[i] || 4,
      status: "free" as const,
      isActive: true,
      currentOrderId: undefined,
    };
  });
}

export const seedTables: Table[] = [
  ...makeTables("f1", 1),
  ...makeTables("f2", 11),
];

// ─── Categories ───
export const seedCategories: Category[] = [
  // Floor 1 (Halal)
  { id: "c1", floorId: "f1", name: "Sweet", printerId: "p1", sortOrder: 1, isActive: true },
  { id: "c2", floorId: "f1", name: "Spicy", printerId: "p2", sortOrder: 2, isActive: true },
  { id: "c3", floorId: "f1", name: "Drinks", printerId: "p3", sortOrder: 3, isActive: true },
  // Floor 2 (Non-Halal)
  { id: "c4", floorId: "f2", name: "Sweet", printerId: "p1", sortOrder: 1, isActive: true },
  { id: "c5", floorId: "f2", name: "Spicy", printerId: "p2", sortOrder: 2, isActive: true },
  { id: "c6", floorId: "f2", name: "Drinks", printerId: "p3", sortOrder: 3, isActive: true },
];

// ─── Menu Items ───
export const seedMenuItems: MenuItem[] = [
  // Floor 1 (Halal) - Sweet
  { id: "mi1", floorId: "f1", categoryId: "c1", name: "Gulab Jamun", price: 250, available: true, isActive: true, sortOrder: 1, image: "https://images.unsplash.com/photo-1666190064034-98ab5f3a6c8a?w=300&h=200&fit=crop" },
  { id: "mi2", floorId: "f1", categoryId: "c1", name: "Kheer", price: 300, available: true, isActive: true, sortOrder: 2, image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=300&h=200&fit=crop" },
  { id: "mi3", floorId: "f1", categoryId: "c1", name: "Jalebi", price: 200, available: true, isActive: true, sortOrder: 3 },
  // Floor 1 (Halal) - Spicy
  { id: "mi4", floorId: "f1", categoryId: "c2", name: "Chicken Biryani", price: 650, available: true, isActive: true, sortOrder: 1, image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&h=200&fit=crop" },
  { id: "mi5", floorId: "f1", categoryId: "c2", name: "Chicken Karahi", price: 850, available: true, isActive: true, sortOrder: 2, image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=300&h=200&fit=crop" },
  { id: "mi6", floorId: "f1", categoryId: "c2", name: "Seekh Kebab", price: 450, available: true, isActive: true, sortOrder: 3 },
  // Floor 1 (Halal) - Drinks
  { id: "mi7", floorId: "f1", categoryId: "c3", name: "Lassi", price: 180, available: true, isActive: true, sortOrder: 1 },
  { id: "mi8", floorId: "f1", categoryId: "c3", name: "Mint Lemonade", price: 150, available: true, isActive: true, sortOrder: 2 },

  // Floor 2 (Non-Halal) - Sweet
  { id: "mi9", floorId: "f2", categoryId: "c4", name: "Chocolate Cake", price: 400, available: true, isActive: true, sortOrder: 1, image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&h=200&fit=crop" },
  { id: "mi10", floorId: "f2", categoryId: "c4", name: "Tiramisu", price: 500, available: true, isActive: true, sortOrder: 2 },
  { id: "mi11", floorId: "f2", categoryId: "c4", name: "Cheesecake", price: 450, available: true, isActive: true, sortOrder: 3 },
  // Floor 2 (Non-Halal) - Spicy
  { id: "mi12", floorId: "f2", categoryId: "c5", name: "Pork Ribs", price: 950, available: true, isActive: true, sortOrder: 1, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=300&h=200&fit=crop" },
  { id: "mi13", floorId: "f2", categoryId: "c5", name: "Bacon Burger", price: 750, available: true, isActive: true, sortOrder: 2, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&h=200&fit=crop" },
  { id: "mi14", floorId: "f2", categoryId: "c5", name: "Pepperoni Pizza", price: 850, available: true, isActive: true, sortOrder: 3 },
  // Floor 2 (Non-Halal) - Drinks
  { id: "mi15", floorId: "f2", categoryId: "c6", name: "Craft Beer", price: 500, available: true, isActive: true, sortOrder: 1 },
  { id: "mi16", floorId: "f2", categoryId: "c6", name: "Red Wine", price: 800, available: true, isActive: true, sortOrder: 2 },
];

// ─── Users (DEV ONLY MOCK USERS - Hardcoded for offline simulation) ───
export const seedUsers: User[] = [
  { id: "u1", username: "admin", name: "Admin Manager", role: "admin" },
  { id: "u2", username: "waiter1", name: "Ali Khan", role: "waiter" },
  { id: "u3", username: "waiter2", name: "Zainab Ahmed", role: "waiter" },
  { id: "u4", username: "waiter3", name: "David Chen", role: "waiter", allowedFloors: ["floor-1"] },
];

export const seedPasswords: Record<string, string> = {
  admin: "admin123",
  waiter1: "1234",
  waiter2: "1234",
  waiter3: "1234",
};

export interface MockState {
  floors: Floor[];
  tables: Table[];
  categories: Category[];
  menuItems: MenuItem[];
  printers: Printer[];
  users: User[];
  orders: Order[];
  nextId: number;
}

export function createMockState(): MockState {
  const now = Date.now();
  const initialOrders: Order[] = [
    {
      id: "mock-ord-f1-t3",
      tableId: "f1-t3",
      floorId: "f1",
      waiterId: "u2",
      status: "open",
      items: [
        {
          id: "oi-f1-t3-1",
          menuItemId: "mi1",
          name: "Gulab Jamun",
          price: 250,
          qty: 2,
          note: "warm please",
          batchNo: 1,
          sentAt: new Date(now - 32 * 60 * 1000).toISOString(),
          categoryId: "c1",
        },
      ],
      subtotal: 500,
      tax: 0,
      discount: 0,
      total: 500,
      createdAt: new Date(now - 32 * 60 * 1000).toISOString(),
    },
    {
      id: "mock-ord-f1-t4",
      tableId: "f1-t4",
      floorId: "f1",
      waiterId: "u2",
      status: "open",
      items: [
        {
          id: "oi-f1-t4-1",
          menuItemId: "mi4",
          name: "Chicken Biryani",
          price: 650,
          qty: 2,
          batchNo: 1,
          sentAt: new Date(now - 74 * 60 * 1000).toISOString(),
          categoryId: "c2",
        },
      ],
      subtotal: 1300,
      tax: 0,
      discount: 0,
      total: 1300,
      createdAt: new Date(now - 74 * 60 * 1000).toISOString(),
    },
    {
      id: "mock-ord-paid-1",
      tableId: "f1-t1",
      floorId: "f1",
      waiterId: "u2",
      status: "paid",
      billNo: "B-0001",
      paymentMethod: "cash",
      amountReceived: 2000,
      changeDue: 350,
      paidAt: new Date(now - 120 * 60 * 1000).toISOString(),
      paidBy: "u2",
      items: [
        {
          id: "oi-paid-1-1",
          menuItemId: "mi5",
          name: "Chicken Karahi",
          price: 850,
          qty: 1,
          batchNo: 1,
          sentAt: new Date(now - 140 * 60 * 1000).toISOString(),
          categoryId: "c2",
        },
        {
          id: "oi-paid-1-2",
          menuItemId: "mi4",
          name: "Chicken Biryani",
          price: 650,
          qty: 1,
          batchNo: 1,
          sentAt: new Date(now - 140 * 60 * 1000).toISOString(),
          categoryId: "c2",
        },
        {
          id: "oi-paid-1-3",
          menuItemId: "mi7",
          name: "Lassi",
          price: 150,
          qty: 1,
          batchNo: 1,
          sentAt: new Date(now - 140 * 60 * 1000).toISOString(),
          categoryId: "c3",
        },
      ],
      subtotal: 1650,
      tax: 0,
      discount: 0,
      total: 1650,
      createdAt: new Date(now - 140 * 60 * 1000).toISOString(),
    },
    {
      id: "mock-ord-paid-2",
      tableId: "f2-t2",
      floorId: "f2",
      waiterId: "u3",
      status: "paid",
      billNo: "B-0002",
      paymentMethod: "card",
      amountReceived: 1800,
      changeDue: 0,
      paidAt: new Date(now - 60 * 60 * 1000).toISOString(),
      paidBy: "u3",
      items: [
        {
          id: "oi-paid-2-1",
          menuItemId: "mi12",
          name: "Pork Ribs",
          price: 950,
          qty: 1,
          batchNo: 1,
          sentAt: new Date(now - 90 * 60 * 1000).toISOString(),
          categoryId: "c5",
        },
        {
          id: "oi-paid-2-2",
          menuItemId: "mi14",
          name: "Pepperoni Pizza",
          price: 850,
          qty: 1,
          batchNo: 1,
          sentAt: new Date(now - 90 * 60 * 1000).toISOString(),
          categoryId: "c5",
        },
      ],
      subtotal: 1800,
      tax: 0,
      discount: 0,
      total: 1800,
      createdAt: new Date(now - 90 * 60 * 1000).toISOString(),
    },
  ];

  return {
    floors: [...seedFloors],
    tables: seedTables.map((t) => ({ ...t })),
    categories: seedCategories.map((c) => ({ ...c })),
    menuItems: seedMenuItems.map((m) => ({ ...m })),
    printers: seedPrinters.map((p) => ({ ...p })),
    users: seedUsers.map((u) => ({ ...u })),
    orders: [...getHistoricalOrders(), ...initialOrders],
    nextId: 100,
  };
}
