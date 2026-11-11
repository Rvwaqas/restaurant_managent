import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type {
  ReportFilters,
  ReportSummary,
  SalesOverTimeBucket,
  CategorySalesRow,
  FloorSalesRow,
  WaiterSalesRow,
  TopItemRow,
  PaymentMethodRow,
  PeakHourCell,
  DiscountRow,
  VoidedItemRow,
  DailyClosingReport,
} from "@/types";

function filtersToParams(filters?: ReportFilters): Record<string, string> {
  if (!filters) {
    const today = new Date().toISOString().split("T")[0];
    return { from: today, to: today };
  }
  const params: Record<string, string> = {
    from: filters.from,
    to: filters.to,
  };
  if (filters.floorId && filters.floorId !== "all") params.floorId = filters.floorId;
  if (filters.waiterId) params.waiterId = filters.waiterId;
  if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;
  if (filters.categoryId) params.categoryId = filters.categoryId;
  return params;
}

export const reportsService = {
  async summary(filters?: ReportFilters): Promise<ReportSummary> {
    const { data } = await apiClient.get<ReportSummary>(ENDPOINTS.reports.summary, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async salesOverTime(
    filters?: ReportFilters,
    groupBy?: "hour" | "day" | "month"
  ): Promise<SalesOverTimeBucket[]> {
    const params: Record<string, string> = filtersToParams(filters);
    if (groupBy) params.groupBy = groupBy;
    const { data } = await apiClient.get<SalesOverTimeBucket[]>(ENDPOINTS.reports.salesOverTime, { params });
    return data;
  },

  async byCategory(filters?: ReportFilters): Promise<CategorySalesRow[]> {
    const { data } = await apiClient.get<CategorySalesRow[]>(ENDPOINTS.reports.byCategory, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async byFloor(filters?: ReportFilters): Promise<FloorSalesRow[]> {
    const { data } = await apiClient.get<FloorSalesRow[]>(ENDPOINTS.reports.byFloor, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async byWaiter(filters?: ReportFilters): Promise<WaiterSalesRow[]> {
    const { data } = await apiClient.get<WaiterSalesRow[]>(ENDPOINTS.reports.byWaiter, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async topItems(
    filters?: ReportFilters,
    opts?: { limit?: number; sort?: "qty" | "amount"; order?: "asc" | "desc" }
  ): Promise<TopItemRow[]> {
    const params: Record<string, string> = filtersToParams(filters);
    if (opts?.limit) params.limit = String(opts.limit);
    if (opts?.sort) params.sort = opts.sort;
    if (opts?.order) params.order = opts.order;
    const { data } = await apiClient.get<TopItemRow[]>(ENDPOINTS.reports.topItems, { params });
    return data;
  },

  async byPaymentMethod(filters?: ReportFilters): Promise<PaymentMethodRow[]> {
    const { data } = await apiClient.get<PaymentMethodRow[]>(ENDPOINTS.reports.byPaymentMethod, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async peakHours(filters?: ReportFilters): Promise<PeakHourCell[]> {
    const { data } = await apiClient.get<PeakHourCell[]>(ENDPOINTS.reports.peakHours, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async discounts(filters?: ReportFilters): Promise<DiscountRow[]> {
    const { data } = await apiClient.get<DiscountRow[]>(ENDPOINTS.reports.discounts, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async voidedItems(filters?: ReportFilters): Promise<VoidedItemRow[]> {
    const { data } = await apiClient.get<VoidedItemRow[]>(ENDPOINTS.reports.voidedItems, {
      params: filtersToParams(filters),
    });
    return data;
  },

  async dailyClosing(date: string, floorId?: string): Promise<DailyClosingReport> {
    const params: Record<string, string> = { date };
    if (floorId && floorId !== "all") params.floorId = floorId;
    const { data } = await apiClient.get<DailyClosingReport>(ENDPOINTS.reports.dailyClosing, { params });
    return data;
  },

  // Legacy methods kept for backward compatibility
  async dailySales(params?: { from?: string; to?: string; floorId?: string }) {
    const { data } = await apiClient.get(ENDPOINTS.reports.dailySales, { params });
    return data;
  },

  async categorySales(params?: { from?: string; to?: string; floorId?: string }) {
    const { data } = await apiClient.get(ENDPOINTS.reports.categorySales, { params });
    return data;
  },

  async waiterSales(params?: { from?: string; to?: string }) {
    const { data } = await apiClient.get(ENDPOINTS.reports.waiterSales, { params });
    return data;
  },
};
