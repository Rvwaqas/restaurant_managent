import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type {
  Order,
  SendItemsPayload,
  SendResult,
  PrintJob,
  PayRequest,
  PayResult,
  VoidItemRequest,
  VoidItemResult,
  ListPaidQuery,
  ListPaidResponse,
} from "@/types";

export const ordersService = {
  async list(): Promise<Order[]> {
    const { data } = await apiClient.get<Order[]>(ENDPOINTS.orders.list);
    return data;
  },

  async listByTable(tableId: string): Promise<Order[]> {
    const { data } = await apiClient.get<Order[]>(
      ENDPOINTS.orders.byTable(tableId)
    );
    return data;
  },

  async getOpenByTable(tableId: string): Promise<Order | null> {
    try {
      const { data } = await apiClient.get<Order | null>(
        ENDPOINTS.orders.openByTable(tableId)
      );
      return data;
    } catch {
      return null;
    }
  },

  async listByFloor(floorId: string): Promise<Order[]> {
    const { data } = await apiClient.get<Order[]>(
      ENDPOINTS.orders.byFloor(floorId)
    );
    return data;
  },

  async getById(id: string): Promise<Order> {
    const { data } = await apiClient.get<Order>(ENDPOINTS.orders.byId(id));
    return data;
  },

  async create(order: {
    tableId: string;
    floorId: string;
    waiterId: string;
  }): Promise<Order> {
    const { data } = await apiClient.post<Order>(
      ENDPOINTS.orders.create,
      order
    );
    return data;
  },

  /**
   * Sends draft items to the kitchen.
   * If table has no open order, creates a new one and marks table occupied.
   * If table already has an order, appends a new batch.
   * Uses requestId as an idempotency key to prevent duplication on retry/double-tap.
   */
  async sendItems(payload: SendItemsPayload): Promise<SendResult> {
    const { data } = await apiClient.post<SendResult>(
      ENDPOINTS.orders.sendItems,
      payload
    );
    return data;
  },

  /**
   * Reprints a kitchen slip for a specific batch and category.
   */
  async reprint(
    orderId: string,
    batchNo: number,
    categoryId: string
  ): Promise<PrintJob> {
    const { data } = await apiClient.post<PrintJob>(ENDPOINTS.orders.reprint, {
      orderId,
      batchNo,
      categoryId,
    });
    return data;
  },

  /**
   * Settles bill & marks order paid.
   * Flexible signature supports pay(payload: PayRequest) or legacy pay(orderId, payload).
   */
  async pay(
    payloadOrOrderId: string | PayRequest,
    maybePayload?: Partial<PayRequest>
  ): Promise<PayResult> {
    let payload: PayRequest;
    if (typeof payloadOrOrderId === "string") {
      payload = {
        orderId: payloadOrOrderId,
        requestId: maybePayload?.requestId || "legacy-pay-req",
        method: maybePayload?.method || "cash",
        ...maybePayload,
      } as PayRequest;
    } else {
      payload = payloadOrOrderId;
    }

    const { data } = await apiClient.post<PayResult>(
      ENDPOINTS.orders.pay(payload.orderId),
      payload
    );
    return data;
  },

  /**
   * Reprints the cashier bill slip for a paid order.
   */
  async reprintBill(orderId: string): Promise<PrintJob> {
    const { data } = await apiClient.post<PrintJob>(
      ENDPOINTS.orders.reprintBill(orderId)
    );
    return data;
  },

  /**
   * Voids/cancels a sent order item with a required reason. (Admin only)
   */
  async voidItem(payload: VoidItemRequest): Promise<VoidItemResult> {
    const { data } = await apiClient.post<VoidItemResult>(
      ENDPOINTS.orders.voidItem(payload.orderId),
      payload
    );
    return data;
  },

  /**
   * Lists paid bills with optional date, floor, method filters & pagination.
   */
  async listPaid(params?: ListPaidQuery): Promise<ListPaidResponse> {
    const { data } = await apiClient.get<ListPaidResponse>(
      ENDPOINTS.orders.listPaid,
      { params }
    );
    return data;
  },

  async cancel(orderId: string): Promise<Order> {
    const { data } = await apiClient.post<Order>(
      ENDPOINTS.orders.cancel(orderId)
    );
    return data;
  },
};
