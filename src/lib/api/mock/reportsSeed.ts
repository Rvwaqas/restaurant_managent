import type { Order, OrderItem, PaymentMethod } from "@/types";

/** Seeded pseudo-random number generator (deterministic) */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const rng = seededRng(42);

function rndBetween(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function rndPick<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

interface HistoryItem {
  menuItemId: string;
  name: string;
  categoryId: string;
  price: number;
  floorId: string;
}

const historyItems: HistoryItem[] = [
  { menuItemId: "mi1", name: "Gulab Jamun", categoryId: "c1", price: 250, floorId: "f1" },
  { menuItemId: "mi2", name: "Kheer", categoryId: "c1", price: 300, floorId: "f1" },
  { menuItemId: "mi3", name: "Jalebi", categoryId: "c1", price: 200, floorId: "f1" },
  { menuItemId: "mi4", name: "Chicken Biryani", categoryId: "c2", price: 650, floorId: "f1" },
  { menuItemId: "mi5", name: "Chicken Karahi", categoryId: "c2", price: 850, floorId: "f1" },
  { menuItemId: "mi6", name: "Seekh Kebab", categoryId: "c2", price: 450, floorId: "f1" },
  { menuItemId: "mi7", name: "Lassi", categoryId: "c3", price: 180, floorId: "f1" },
  { menuItemId: "mi8", name: "Mint Lemonade", categoryId: "c3", price: 150, floorId: "f1" },
  { menuItemId: "mi9", name: "Chocolate Cake", categoryId: "c4", price: 400, floorId: "f2" },
  { menuItemId: "mi10", name: "Tiramisu", categoryId: "c4", price: 500, floorId: "f2" },
  { menuItemId: "mi11", name: "Cheesecake", categoryId: "c4", price: 450, floorId: "f2" },
  { menuItemId: "mi12", name: "Pork Ribs", categoryId: "c5", price: 950, floorId: "f2" },
  { menuItemId: "mi13", name: "Bacon Burger", categoryId: "c5", price: 750, floorId: "f2" },
  { menuItemId: "mi14", name: "Pepperoni Pizza", categoryId: "c5", price: 850, floorId: "f2" },
  { menuItemId: "mi15", name: "Craft Beer", categoryId: "c6", price: 500, floorId: "f2" },
  { menuItemId: "mi16", name: "Red Wine", categoryId: "c6", price: 800, floorId: "f2" },
];

const f1Items = historyItems.filter((i) => i.floorId === "f1");
const f2Items = historyItems.filter((i) => i.floorId === "f2");

const tablesByFloor: Record<string, string[]> = {
  f1: ["f1-t1", "f1-t2", "f1-t5", "f1-t6", "f1-t9", "f1-t10"],
  f2: ["f2-t1", "f2-t2", "f2-t5", "f2-t6", "f2-t9", "f2-t10"],
};

const tableNumbers: Record<string, number> = {
  "f1-t1": 1, "f1-t2": 2, "f1-t5": 5, "f1-t6": 6, "f1-t9": 9, "f1-t10": 10,
  "f2-t1": 11, "f2-t2": 12, "f2-t5": 15, "f2-t6": 16, "f2-t9": 19, "f2-t10": 20,
};

const waitersByFloor: Record<string, string[]> = {
  f1: ["u2", "u4"],
  f2: ["u3"],
};

const paymentMethods: readonly PaymentMethod[] = ["cash", "cash", "cash", "card", "online"];

// Peak hours: lunch 12-14, dinner 19-22
const peakHours = [12, 13, 14, 19, 20, 21, 22];
const normalHours = [11, 15, 16, 17, 18, 23];

let historyOrderCount = 0;
let historyBillSeq = 3; // start after the seed bills B-0001, B-0002

export function generateHistoricalOrders(): Order[] {
  const orders: Order[] = [];
  const now = new Date();

  // Generate 90 days of history
  for (let daysAgo = 90; daysAgo >= 1; daysAgo--) {
    const dayBase = new Date(now);
    dayBase.setDate(dayBase.getDate() - daysAgo);
    dayBase.setHours(0, 0, 0, 0);

    // Weekend = more orders
    const dow = dayBase.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 5 || dow === 6;
    const billsForDay = rndBetween(isWeekend ? 70 : 40, isWeekend ? 120 : 80);

    for (let b = 0; b < billsForDay; b++) {
      historyOrderCount++;
      const isPeak = rng() < 0.65;
      const hour = isPeak ? rndPick(peakHours) : rndPick(normalHours);
      const minute = rndBetween(0, 59);

      const paidAt = new Date(dayBase);
      paidAt.setHours(hour, minute, 0, 0);

      // Pick floor randomly with slight bias to f1
      const floorId = rng() < 0.55 ? "f1" : "f2";
      const floorItems = floorId === "f1" ? f1Items : f2Items;
      const tableId = rndPick(tablesByFloor[floorId]);
      const waiterId = rndPick(waitersByFloor[floorId]);

      // 1-4 items per bill
      const numItems = rndBetween(1, 4);
      const orderItems: OrderItem[] = [];
      let subtotal = 0;

      for (let i = 0; i < numItems; i++) {
        const menuItem = rndPick(floorItems);
        const qty = rndBetween(1, 3);
        const lineTotal = menuItem.price * qty;
        subtotal += lineTotal;

        const oi: OrderItem = {
          id: `hi-${historyOrderCount}-${i}`,
          menuItemId: menuItem.menuItemId,
          name: menuItem.name,
          price: menuItem.price,
          qty,
          batchNo: 1,
          sentAt: new Date(paidAt.getTime() - rndBetween(10, 40) * 60 * 1000).toISOString(),
          categoryId: menuItem.categoryId,
        };

        // ~5% chance of a voided item in historical data
        if (rng() < 0.05 && orderItems.length > 0) {
          const reasons = ["Wrong order", "Customer changed mind", "Out of stock", "Duplicate entry"];
          oi.voided = true;
          oi.voidReason = rndPick(reasons);
          oi.voidedAt = new Date(paidAt.getTime() - 5 * 60 * 1000).toISOString();
          oi.voidedBy = "u1";
          subtotal -= lineTotal; // voided items excluded from totals
        }

        orderItems.push(oi);
      }

      // ~8% chance of discount
      let discountAmount = 0;
      let discountType: "amount" | "percent" | undefined;
      let discountValue = 0;

      if (rng() < 0.08 && subtotal > 500) {
        if (rng() < 0.5) {
          discountType = "percent";
          discountValue = rndPick([5, 10, 15, 20]);
          discountAmount = Math.round((subtotal * discountValue) / 100);
        } else {
          discountType = "amount";
          discountValue = rndPick([50, 100, 200, 300]);
          discountAmount = Math.min(discountValue, subtotal * 0.3);
        }
      }

      const netSales = subtotal - discountAmount;
      const tax = 0;
      const serviceCharge = 0;
      const total = netSales + tax + serviceCharge;

      const method = rndPick(paymentMethods);
      const billNo = `B-${String(historyBillSeq).padStart(4, "0")}`;
      historyBillSeq++;

      // Suppress unused variable warnings
      void tableNumbers;

      const order: Order = {
        id: `hist-ord-${historyOrderCount}`,
        tableId,
        floorId,
        waiterId,
        status: "paid",
        billNo,
        paymentMethod: method,
        amountReceived: method === "cash" ? total + rndBetween(0, 500) : total,
        changeDue: method === "cash" ? rndBetween(0, 500) : 0,
        paidAt: paidAt.toISOString(),
        paidBy: waiterId,
        items: orderItems,
        subtotal,
        tax,
        serviceCharge,
        discount: discountAmount,
        discountType,
        discountValue: discountValue || undefined,
        total,
        createdAt: new Date(paidAt.getTime() - rndBetween(15, 90) * 60 * 1000).toISOString(),
      };

      orders.push(order);
    }
  }

  return orders;
}

// Generate once and reuse (singleton)
let _cached: Order[] | null = null;
export function getHistoricalOrders(): Order[] {
  if (!_cached) {
    _cached = generateHistoricalOrders();
  }
  return _cached;
}
