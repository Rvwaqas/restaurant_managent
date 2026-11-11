// ─── Floor ───
export interface Floor {
  id: string;
  slug: "floor-1" | "floor-2";
  name: string;
  menuType: "halal" | "non-halal";
}

// ─── Table ───
export type TableStatus = "free" | "occupied";

export interface Table {
  id: string;
  floorId: string;
  number: number;
  capacity: number;
  status: TableStatus;
  isActive: boolean;
  currentOrderId?: string;
  runningTotal?: number;
  openedAt?: string; // ISO 8601 string when table was marked occupied
}

// ─── Printer ───
export type PrinterRole = "kitchen" | "cashier";

export interface Printer {
  id: string;
  name: string;
  ip: string;
  port: number;
  isActive: boolean;
  role: PrinterRole;
}

// ─── Category ───
export interface Category {
  id: string;
  floorId: string;
  name: string;
  printerId: string;
  sortOrder: number;
  isActive: boolean;
}

// ─── MenuItem ───
export interface MenuItem {
  id: string;
  floorId: string;
  categoryId: string;
  name: string;
  price: number;
  image?: string | null;
  available: boolean;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  subcategory?: string | null;
}

// ─── OrderItem ───
export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  batchNo: number;
  sentAt: string;
  categoryId: string;
  voided?: boolean;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
}

// ─── PrintJob & Send Result ───
export interface PrintJob {
  categoryId: string;
  categoryName: string;
  printerId: string;
  printerName: string;
  status: "printed" | "failed";
  error?: string;
}

export interface SendItemDraft {
  menuItemId: string;
  qty: number;
  note?: string;
}

export interface SendItemsPayload {
  tableId: string;
  requestId: string; // client generated uuid, used as idempotency key
  items: SendItemDraft[];
}

export interface SendResult {
  order: Order;
  batchNo: number;
  printJobs: PrintJob[];
}

export interface FloorMenuResponse {
  categories: Category[];
  items: MenuItem[];
}

// ─── Order ───
export type OrderStatus = "open" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "card" | "online";
export type DiscountType = "amount" | "percent";

export interface Order {
  id: string;
  tableId: string;
  floorId: string;
  waiterId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  serviceCharge?: number;
  discount: number;
  discountType?: DiscountType;
  discountValue?: number;
  total: number;
  createdAt: string;
  billNo?: string;
  paymentMethod?: PaymentMethod;
  amountReceived?: number;
  changeDue?: number;
  paidAt?: string;
  paidBy?: string;
}

// ─── User / Auth ───
export type UserRole = "admin" | "waiter";
export type FloorSlug = "floor-1" | "floor-2";

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  allowedFloors?: FloorSlug[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  expiresAt: string;
}

// Backward compatibility aliases
export type AuthCredentials = LoginRequest;
export type AuthResponse = LoginResponse;

// ─── API helpers ───
export interface ApiError {
  status: number;
  message: string;
  details?: string;
  code?: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// ─── Cart (client-side only) ───
export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  categoryId: string;
}

// ─── Report types ───
export interface DailySalesReport {
  date: string;
  totalSales: number;
  totalOrders: number;
  totalTax: number;
}

export interface CategorySalesReport {
  categoryId: string;
  categoryName: string;
  totalSales: number;
  itemCount: number;
}

export interface TopItemReport {
  menuItemId: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
}

export interface WaiterSalesReport {
  waiterId: string;
  waiterName: string;
  totalSales: number;
  totalOrders: number;
}

// ─── Pay & Bill Types (Task F6) ───
export interface PayRequest {
  orderId: string;
  requestId: string; // uuid, idempotency key
  method: PaymentMethod;
  discountType?: DiscountType;
  discountValue?: number;
  amountReceived?: number;
}

export interface PayResult {
  order: Order;
  billPrintJob: PrintJob;
  table: Table;
}

export interface VoidItemRequest {
  orderId: string;
  orderItemId: string;
  reason: string;
  requestId: string;
}

export interface VoidItemResult {
  order: Order;
  printJob: PrintJob;
}

export interface ListPaidQuery {
  date?: string;
  floorId?: string;
  paymentMethod?: PaymentMethod;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListPaidResponse {
  items: Order[];
  total: number;
  page: number;
  limit: number;
  totalAmount: number;
}

// Backward-compatibility alias
export type PayPayload = PayRequest;

// ─── Admin Management Types (Task F7) ───
export interface TestPrintResult {
  status: "ok" | "failed";
  message: string;
}

export interface BulkCreateTablesPayload {
  from: number;
  to: number;
  capacity: number;
}

export interface BulkCreateTablesResult {
  created: Table[];
  skippedNumbers: number[];
}

export interface DuplicateItemPayload {
  targetFloorId: string;
  targetCategoryId: string;
}

export interface UploadImageResult {
  url: string;
}

export interface DeleteResult {
  success: boolean;
  softDeleted?: boolean;
  message?: string;
}

// ─── Report Types (Task F8) ───
export interface ReportFilters {
  from: string; // ISO date string "YYYY-MM-DD"
  to: string;   // ISO date string "YYYY-MM-DD"
  floorId?: string; // "f1" | "f2" | "all"
  waiterId?: string;
  paymentMethod?: PaymentMethod;
  categoryId?: string;
}

export interface ReportPeriodMetrics {
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
  billsCount: number;
  itemsSold: number;
  avgBill: number;
  voidedItemsCount: number;
  voidedAmount: number;
}

export interface ReportSummary extends ReportPeriodMetrics {
  comparison: {
    previousPeriod: ReportPeriodMetrics;
    changePercent: Partial<Record<keyof ReportPeriodMetrics, number>>;
  };
}

export interface SalesOverTimeBucket {
  bucket: string; // ISO string label (hour: "2026-11-05T14:00", day: "2026-11-05", month: "2026-11")
  grandTotal: number;
  billsCount: number;
  netSales: number;
}

export interface CategorySalesRow {
  categoryId: string;
  name: string;
  floorId: string;
  qty: number;
  amount: number; // grandTotal contribution
  sharePercent: number;
}

export interface FloorSalesRow {
  floorId: string;
  name: string;
  billsCount: number;
  grandTotal: number;
  avgBill: number;
}

export interface WaiterSalesRow {
  waiterId: string;
  name: string;
  billsCount: number;
  itemsSold: number;
  grandTotal: number;
  avgBill: number;
  sharePercent: number;
}

export interface TopItemRow {
  menuItemId: string;
  name: string;
  categoryName: string;
  floorId: string;
  qty: number;
  amount: number;
}

export interface PaymentMethodRow {
  method: PaymentMethod;
  billsCount: number;
  amount: number;
  sharePercent: number;
}

export interface PeakHourCell {
  weekday: number; // 0=Sun … 6=Sat
  hour: number;    // 0-23
  billsCount: number;
  grandTotal: number;
}

export interface DiscountRow {
  billNo: string;
  orderId: string;
  paidAt: string;
  tableNumber: number;
  floorName: string;
  waiterName: string;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
}

export interface VoidedItemRow {
  time: string;
  billNo?: string;
  orderId: string;
  tableNumber: number;
  floorName: string;
  itemName: string;
  qty: number;
  amount: number;
  reason: string;
  voidedBy: string;
}

export interface DailyClosingReport {
  date: string; // "YYYY-MM-DD"
  openedAt: string | null;   // ISO of first bill
  closedAt: string | null;   // ISO of last bill
  summary: ReportPeriodMetrics;
  byPaymentMethod: PaymentMethodRow[];
  byFloor: FloorSalesRow[];
  byCategory: CategorySalesRow[];
  topItems: TopItemRow[];
  discountsTotal: number;
  voidedTotal: number;
  openTablesCount: number;
}
