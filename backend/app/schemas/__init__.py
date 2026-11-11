from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class User(BaseModel):
    id: str
    username: str
    name: str
    role: str
    allowedFloors: Optional[List[str]] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user: User
    expiresAt: str

class FloorSchema(BaseModel):
    id: str
    slug: str
    name: str
    menuType: str
    sortOrder: Optional[int] = 1
    isActive: Optional[bool] = True

class TableSchema(BaseModel):
    id: str
    floorId: str
    number: int
    capacity: int
    status: str
    isActive: bool = True
    currentOrderId: Optional[str] = None
    runningTotal: Optional[float] = None
    openedAt: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class CreateTablePayload(BaseModel):
    floorId: str
    number: int
    capacity: Optional[int] = 4
    isActive: Optional[bool] = True

class UpdateTablePayload(BaseModel):
    number: Optional[int] = None
    capacity: Optional[int] = None
    isActive: Optional[bool] = None

class BulkCreateTablesPayload(BaseModel):
    floorId: Optional[str] = None
    from_: int = Field(..., alias="from")
    to: int
    capacity: Optional[int] = 4

    model_config = ConfigDict(populate_by_name=True)

class BulkCreateTablesResult(BaseModel):
    created: List[TableSchema]
    skippedNumbers: List[int]

class CategorySchema(BaseModel):
    id: str
    floorId: str
    name: str
    printerId: str
    sortOrder: int
    isActive: bool = True
    serveFrom: Optional[str] = None
    serveTo: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class CreateCategoryPayload(BaseModel):
    floorId: str
    name: str
    printerId: str
    sortOrder: Optional[int] = None
    isActive: Optional[bool] = True
    serveFrom: Optional[str] = None
    serveTo: Optional[str] = None

class UpdateCategoryPayload(BaseModel):
    name: Optional[str] = None
    printerId: Optional[str] = None
    sortOrder: Optional[int] = None
    isActive: Optional[bool] = None
    serveFrom: Optional[str] = None
    serveTo: Optional[str] = None

class ReorderCategoriesPayload(BaseModel):
    floorId: str
    orderedIds: List[str]

class MenuItemSchema(BaseModel):
    id: str
    floorId: str
    categoryId: str
    name: str
    price: float
    description: Optional[str] = None
    image: Optional[str] = None
    available: bool = True
    isActive: bool = True
    sortOrder: int = 1
    subcategory: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class CreateMenuItemPayload(BaseModel):
    floorId: str
    categoryId: str
    name: str
    price: float
    description: Optional[str] = None
    image: Optional[str] = None
    available: Optional[bool] = True
    isActive: Optional[bool] = True
    sortOrder: Optional[int] = None
    subcategory: Optional[str] = None

class UpdateMenuItemPayload(BaseModel):
    categoryId: Optional[str] = None
    name: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    image: Optional[str] = None
    available: Optional[bool] = None
    isActive: Optional[bool] = None
    sortOrder: Optional[int] = None
    subcategory: Optional[str] = None

class AvailabilityPayload(BaseModel):
    available: Optional[bool] = None

class DuplicateMenuItemPayload(BaseModel):
    targetFloorId: str
    targetCategoryId: str

class ReorderMenuItemsPayload(BaseModel):
    categoryId: str
    orderedIds: List[str]

class PrinterSchema(BaseModel):
    id: str
    name: str
    ip: str
    port: int = 9100
    isActive: bool = True
    role: str

class CreatePrinterPayload(BaseModel):
    name: str
    ip: str
    port: Optional[int] = 9100
    isActive: Optional[bool] = True
    role: Optional[str] = "kitchen"

class UpdatePrinterPayload(BaseModel):
    name: Optional[str] = None
    ip: Optional[str] = None
    port: Optional[int] = None
    isActive: Optional[bool] = None
    role: Optional[str] = None

class TestPrintResult(BaseModel):
    status: str
    message: str

class DeleteResult(BaseModel):
    success: bool
    softDeleted: bool = False
    message: Optional[str] = None

class UploadImageResult(BaseModel):
    url: str

class FloorMenuResponse(BaseModel):
    categories: List[CategorySchema]
    items: List[MenuItemSchema]

class OrderItemSchema(BaseModel):
    id: str
    menuItemId: str
    name: str
    price: float
    qty: int
    note: Optional[str] = None
    batchNo: int
    sentAt: str
    categoryId: str
    printerId: Optional[str] = None
    status: Optional[str] = "sent"
    voided: Optional[bool] = False
    voidReason: Optional[str] = None
    voidedAt: Optional[str] = None
    voidedBy: Optional[str] = None
    cancelReason: Optional[str] = None
    cancelledAt: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class PrintJobSchema(BaseModel):
    id: Optional[str] = None
    categoryId: Optional[str] = None
    categoryName: Optional[str] = None
    printerId: str
    printerName: str
    printerIp: Optional[str] = None
    role: Optional[str] = None
    content: Optional[str] = None
    status: str = "printed"
    error: Optional[str] = None
    printedAt: Optional[str] = None
    kind: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class OrderSchema(BaseModel):
    id: str
    tableId: str
    floorId: str
    waiterId: str
    status: str
    items: List[OrderItemSchema] = []
    subtotal: float
    tax: float
    serviceCharge: Optional[float] = 0.0
    discount: float = 0.0
    discountType: Optional[str] = None
    discountValue: Optional[float] = None
    total: float
    createdAt: str
    billNo: Optional[str] = None
    paymentMethod: Optional[str] = None
    amountReceived: Optional[float] = None
    changeDue: Optional[float] = None
    paidAt: Optional[str] = None
    paidBy: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class SendItemDraft(BaseModel):
    menuItemId: str
    qty: int
    note: Optional[str] = None

class SendItemsPayload(BaseModel):
    tableId: str
    requestId: str
    items: List[SendItemDraft]

class SendResultSchema(BaseModel):
    order: OrderSchema
    batchNo: int
    printJobs: List[PrintJobSchema]

class ReprintKitchenSlipPayload(BaseModel):
    orderId: str
    batchNo: int
    categoryId: str

class PayRequestPayload(BaseModel):
    orderId: Optional[str] = None
    requestId: str
    method: str = "cash"
    discountType: Optional[str] = None
    discountValue: Optional[float] = None
    amountReceived: Optional[float] = None

class PayResultSchema(BaseModel):
    order: OrderSchema
    billPrintJob: PrintJobSchema
    table: TableSchema

class VoidItemPayload(BaseModel):
    orderId: Optional[str] = None
    orderItemId: Optional[str] = None
    menuItemId: Optional[str] = None
    batchNo: Optional[int] = None
    reason: str
    requestId: Optional[str] = None

class VoidItemResultSchema(BaseModel):
    order: OrderSchema
    printJob: PrintJobSchema
    cancelPrintJobs: List[PrintJobSchema]
    voidedItem: OrderItemSchema

class ListPaidResponseSchema(BaseModel):
    items: List[OrderSchema]
    orders: Optional[List[OrderSchema]] = None
    total: int
    page: int
    limit: int
    totalAmount: float
    totalPages: Optional[int] = None

class CreateOrderPayload(BaseModel):
    tableId: str
    floorId: Optional[str] = None
    waiterId: Optional[str] = None


# ─── B5 Reports Schemas ───

class ReportPeriodMetrics(BaseModel):
    grossSales: float
    discounts: float
    netSales: float
    tax: float
    serviceCharge: float
    grandTotal: float
    billsCount: int
    itemsSold: int
    avgBill: float
    voidedItemsCount: int
    voidedAmount: float


class ComparisonData(BaseModel):
    previousPeriod: ReportPeriodMetrics
    changePercent: Dict[str, float]


class ReportSummary(ReportPeriodMetrics):
    comparison: ComparisonData


class SalesOverTimeBucket(BaseModel):
    bucket: str
    grandTotal: float
    billsCount: int
    netSales: float


class CategorySalesRow(BaseModel):
    categoryId: str
    name: str
    floorId: str
    qty: int
    amount: float
    sharePercent: float


class FloorSalesRow(BaseModel):
    floorId: str
    name: str
    billsCount: int
    grandTotal: float
    avgBill: float


class WaiterSalesRow(BaseModel):
    waiterId: str
    name: str
    billsCount: int
    itemsSold: int
    grandTotal: float
    avgBill: float
    sharePercent: float


class TopItemRow(BaseModel):
    menuItemId: str
    name: str
    categoryName: str
    floorId: str
    qty: int
    amount: float


class PaymentMethodRow(BaseModel):
    method: str
    billsCount: int
    amount: float
    sharePercent: float


class PeakHourCell(BaseModel):
    weekday: int
    hour: int
    billsCount: int
    grandTotal: float


class DiscountRow(BaseModel):
    billNo: str
    orderId: str
    paidAt: str
    tableNumber: int
    floorName: str
    waiterName: str
    discountType: str
    discountValue: float
    discountAmount: float


class VoidedItemRow(BaseModel):
    time: str
    billNo: Optional[str] = None
    orderId: str
    tableNumber: int
    floorName: str
    itemName: str
    qty: int
    amount: float
    reason: str
    voidedBy: str


class DailyClosingReport(BaseModel):
    date: str
    openedAt: Optional[str] = None
    closedAt: Optional[str] = None
    summary: ReportPeriodMetrics
    byPaymentMethod: List[PaymentMethodRow]
    byFloor: List[FloorSalesRow]
    byCategory: List[CategorySalesRow]
    topItems: List[TopItemRow]
    discountsTotal: float
    voidedTotal: float
    openTablesCount: int


class DailySalesRow(BaseModel):
    date: str
    totalSales: float
    totalOrders: int
    totalTax: float


class CategorySalesLegacyRow(BaseModel):
    categoryId: str
    categoryName: str
    totalSales: float
    itemCount: int


class WaiterSalesLegacyRow(BaseModel):
    waiterId: str
    waiterName: str
    totalSales: float
    totalOrders: int


