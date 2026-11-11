import { z } from "zod";

// ─── AUTH SCHEMAS ───
export const UserRoleSchema = z.enum(["admin", "waiter"]);

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  role: UserRoleSchema,
  allowedFloors: z.array(z.string()).optional(),
});

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
  expiresAt: z.string(),
});

// ─── FLOOR SCHEMAS ───
export const FloorSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.enum(["floor-1", "floor-2"]),
  menuType: z.enum(["halal", "non-halal"]).nullish(),
  sortOrder: z.number().nullish(),
  isActive: z.boolean().nullish(),
});

// ─── TABLE SCHEMAS ───
export const TableStatusSchema = z.enum(["free", "occupied"]);

export const TableSchema = z.object({
  id: z.string(),
  floorId: z.string(),
  number: z.number(),
  capacity: z.number(),
  status: TableStatusSchema,
  currentOrderId: z.string().nullish(),
  runningTotal: z.number().nullish(),
  openedAt: z.string().nullish(),
  isActive: z.boolean().nullish(),
});

export const BulkCreateTablesPayloadSchema = z.object({
  fromNumber: z.number().int().positive(),
  toNumber: z.number().int().positive(),
  capacity: z.number().int().positive(),
  isActive: z.boolean().nullish(),
});

export const BulkCreateTablesResultSchema = z.object({
  created: z.number(),
  skipped: z.array(z.number()),
  tables: z.array(TableSchema),
});

// ─── CATEGORY SCHEMAS ───
export const CategorySchema = z.object({
  id: z.string(),
  floorId: z.string(),
  name: z.string(),
  printerId: z.string(),
  sortOrder: z.number(),
  isActive: z.boolean().nullish(),
  serveFrom: z.string().nullish(),
  serveTo: z.string().nullish(),
});

// ─── MENU ITEM SCHEMAS ───
export const MenuItemSchema = z.object({
  id: z.string(),
  floorId: z.string(),
  categoryId: z.string(),
  name: z.string(),
  price: z.number().nonnegative(),
  image: z.string().nullish(),
  description: z.string().nullish(),
  available: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  subcategory: z.string().nullish(),
});

export const DuplicateItemPayloadSchema = z.object({
  targetFloorId: z.string(),
  targetCategoryId: z.string(),
});

// ─── PRINTER SCHEMAS ───
export const PrinterRoleSchema = z.enum(["kitchen", "cashier"]);

export const PrinterSchema = z.object({
  id: z.string(),
  name: z.string(),
  ip: z.string(),
  port: z.number(),
  isActive: z.boolean(),
  role: PrinterRoleSchema,
});

export const TestPrintResultSchema = z.object({
  status: z.enum(["ok", "failed"]),
  message: z.string(),
  printerId: z.string().optional(),
  timestamp: z.string().optional(),
});

// ─── ORDER & ITEM SCHEMAS ───
export const OrderItemStatusSchema = z.enum(["sent", "cancelled"]);

export const OrderItemSchema = z.object({
  id: z.string().nullish(),
  menuItemId: z.string(),
  name: z.string(),
  price: z.number().nonnegative(),
  qty: z.number().int().positive(),
  note: z.string().nullish(),
  categoryId: z.string(),
  printerId: z.string().nullish(),
  batchNo: z.number(),
  sentAt: z.string(),
  voided: z.boolean().nullish(),
  voidReason: z.string().nullish(),
  voidedAt: z.string().nullish(),
  voidedBy: z.string().nullish(),
  status: OrderItemStatusSchema.nullish(),
  cancelReason: z.string().nullish(),
  cancelledAt: z.string().nullish(),
});

export const OrderBatchSchema = z.object({
  batchNo: z.number(),
  sentAt: z.string(),
  items: z.array(OrderItemSchema),
});

export const OrderStatusSchema = z.enum(["open", "paid", "cancelled"]);
export const DiscountTypeSchema = z.enum(["percent", "amount"]);
export const PaymentMethodSchema = z.enum(["cash", "card", "online"]);

export const OrderSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  floorId: z.string(),
  waiterId: z.string(),
  status: OrderStatusSchema,
  items: z.array(OrderItemSchema),
  batches: z.array(OrderBatchSchema).nullish(),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  serviceCharge: z.number().nonnegative().nullish(),
  discount: z.number().nonnegative(),
  discountType: DiscountTypeSchema.nullish(),
  discountValue: z.number().nullish(),
  total: z.number().nonnegative(),
  createdAt: z.string(),
  paidAt: z.string().nullish(),
  billNo: z.string().nullish(),
  paymentMethod: PaymentMethodSchema.nullish(),
  amountReceived: z.number().nullish(),
  changeDue: z.number().nullish(),
  paidBy: z.string().nullish(),
});

export const SendItemsPayloadSchema = z.object({
  tableId: z.string(),
  requestId: z.string(),
  items: z.array(
    z.object({
      menuItemId: z.string(),
      qty: z.number().int().positive(),
      note: z.string().nullish(),
    })
  ).min(1),
});

export const PrintJobSchema = z.object({
  id: z.string().nullish(),
  categoryId: z.string().nullish(),
  categoryName: z.string().nullish(),
  printerId: z.string(),
  printerName: z.string(),
  printerIp: z.string().nullish(),
  role: PrinterRoleSchema.nullish(),
  content: z.string().nullish(),
  status: z.enum(["ok", "failed", "printed"]),
  error: z.string().nullish(),
  printedAt: z.string().nullish(),
  kind: z.string().nullish(),
});

export const SendResultSchema = z.object({
  order: OrderSchema,
  batchNo: z.number(),
  printJobs: z.array(PrintJobSchema),
});

export const PayRequestSchema = z.object({
  orderId: z.string(),
  requestId: z.string(),
  method: PaymentMethodSchema,
  discountType: DiscountTypeSchema.optional(),
  discountValue: z.number().optional(),
  amountReceived: z.number().optional(),
});

export const PayResultSchema = z.object({
  order: OrderSchema,
  billPrintJob: PrintJobSchema,
  table: TableSchema,
});

export const VoidItemRequestSchema = z.object({
  orderId: z.string(),
  menuItemId: z.string(),
  batchNo: z.number(),
  reason: z.string().min(1),
});

export const VoidItemResultSchema = z.object({
  order: OrderSchema,
  cancelPrintJobs: z.array(PrintJobSchema),
  voidedItem: OrderItemSchema,
});

export const FloorMenuResponseSchema = z.object({
  categories: z.array(CategorySchema),
  items: z.array(MenuItemSchema),
});

export const ListPaidResponseSchema = z.object({
  items: z.array(OrderSchema),
  total: z.number(),
  totalAmount: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const DeleteResultSchema = z.object({
  success: z.boolean(),
  id: z.string(),
  message: z.string().optional(),
  softDeleted: z.boolean().optional(),
});

export const UploadImageResultSchema = z.object({
  url: z.string(),
});

// ─── REPORTS SCHEMAS ───
export const ReportPeriodMetricsSchema = z.object({
  grossSales: z.number(),
  discounts: z.number(),
  netSales: z.number(),
  tax: z.number(),
  serviceCharge: z.number(),
  grandTotal: z.number(),
  billsCount: z.number(),
  itemsSold: z.number(),
  avgBill: z.number(),
  voidedItemsCount: z.number(),
  voidedAmount: z.number(),
});

export const ReportSummarySchema = ReportPeriodMetricsSchema.extend({
  comparison: z.object({
    previousPeriod: ReportPeriodMetricsSchema,
    changePercent: z.record(z.string(), z.number()),
  }),
});

export const SalesOverTimeBucketSchema = z.object({
  bucket: z.string(),
  grandTotal: z.number(),
  billsCount: z.number(),
  netSales: z.number(),
});

export const CategorySalesRowSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  floorId: z.string(),
  qty: z.number(),
  amount: z.number(),
  sharePercent: z.number(),
});

export const FloorSalesRowSchema = z.object({
  floorId: z.string(),
  name: z.string(),
  billsCount: z.number(),
  grandTotal: z.number(),
  avgBill: z.number(),
});

export const WaiterSalesRowSchema = z.object({
  waiterId: z.string(),
  name: z.string(),
  billsCount: z.number(),
  itemsSold: z.number(),
  grandTotal: z.number(),
  avgBill: z.number(),
  sharePercent: z.number(),
});

export const TopItemRowSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  categoryName: z.string(),
  floorId: z.string(),
  qty: z.number(),
  amount: z.number(),
});

export const PaymentMethodRowSchema = z.object({
  method: PaymentMethodSchema,
  billsCount: z.number(),
  amount: z.number(),
  sharePercent: z.number(),
});

export const PeakHourCellSchema = z.object({
  weekday: z.number(),
  hour: z.number(),
  billsCount: z.number(),
  grandTotal: z.number(),
});

export const DiscountRowSchema = z.object({
  billNo: z.string(),
  orderId: z.string(),
  paidAt: z.string(),
  tableNumber: z.number(),
  floorName: z.string(),
  waiterName: z.string(),
  discountType: DiscountTypeSchema,
  discountValue: z.number(),
  discountAmount: z.number(),
});

export const VoidedItemRowSchema = z.object({
  time: z.string(),
  billNo: z.string().optional(),
  orderId: z.string(),
  tableNumber: z.number(),
  floorName: z.string(),
  itemName: z.string(),
  qty: z.number(),
  amount: z.number(),
  reason: z.string(),
  voidedBy: z.string(),
});

export const DailyClosingReportSchema = z.object({
  date: z.string(),
  openedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  summary: ReportPeriodMetricsSchema,
  byPaymentMethod: z.array(PaymentMethodRowSchema),
  byFloor: z.array(FloorSalesRowSchema),
  byCategory: z.array(CategorySalesRowSchema),
  topItems: z.array(TopItemRowSchema),
  discountsTotal: z.number(),
  voidedTotal: z.number(),
  openTablesCount: z.number(),
});

// ─── STANDARD ERROR BODY SCHEMA ───
export const ApiErrorSchema = z.object({
  status: z.number().int(),
  message: z.string(),
  details: z.string().optional(),
  code: z.string().optional(),
});
