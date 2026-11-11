import { create } from "zustand";
import { reportsService } from "@/lib/api/services";
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

type ReportStatus = "idle" | "loading" | "success" | "error";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const defaultFilters: ReportFilters = {
  from: todayISO(),
  to: todayISO(),
  floorId: "all",
};

interface ReportsState {
  filters: ReportFilters;
  updatedAt: number | null;

  // Per-report states
  summary: ReportSummary | null;
  summaryStatus: ReportStatus;
  summaryError: string | null;

  salesOverTime: SalesOverTimeBucket[];
  salesOverTimeStatus: ReportStatus;
  salesGroupBy: "hour" | "day" | "month";

  byCategory: CategorySalesRow[];
  byCategoryStatus: ReportStatus;

  byFloor: FloorSalesRow[];
  byFloorStatus: ReportStatus;

  byWaiter: WaiterSalesRow[];
  byWaiterStatus: ReportStatus;

  topItems: TopItemRow[];
  topItemsStatus: ReportStatus;
  topItemsSort: "qty" | "amount";

  bottomItems: TopItemRow[];
  bottomItemsStatus: ReportStatus;

  byPaymentMethod: PaymentMethodRow[];
  byPaymentMethodStatus: ReportStatus;

  peakHours: PeakHourCell[];
  peakHoursStatus: ReportStatus;

  discounts: DiscountRow[];
  discountsStatus: ReportStatus;

  voidedItems: VoidedItemRow[];
  voidedItemsStatus: ReportStatus;

  dailyClosing: DailyClosingReport | null;
  dailyClosingStatus: ReportStatus;
  dailyClosingDate: string;
  dailyClosingFloorId: string;

  // Actions
  setFilters: (filters: Partial<ReportFilters>) => void;
  setTopItemsSort: (sort: "qty" | "amount") => void;
  setDailyClosingParams: (date: string, floorId: string) => void;

  fetchSummary: () => Promise<void>;
  fetchSalesOverTime: (groupBy?: "hour" | "day" | "month") => Promise<void>;
  fetchByCategory: () => Promise<void>;
  fetchByFloor: () => Promise<void>;
  fetchByWaiter: () => Promise<void>;
  fetchTopItems: (sort?: "qty" | "amount") => Promise<void>;
  fetchBottomItems: () => Promise<void>;
  fetchByPaymentMethod: () => Promise<void>;
  fetchPeakHours: () => Promise<void>;
  fetchDiscounts: () => Promise<void>;
  fetchVoidedItems: () => Promise<void>;
  fetchDailyClosing: () => Promise<void>;

  /** Fetch all overview reports at once */
  fetchOverview: () => Promise<void>;
  /** Invalidate all caches (call after a payment or void) */
  invalidateAll: () => void;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  filters: defaultFilters,
  updatedAt: null,

  summary: null,
  summaryStatus: "idle",
  summaryError: null,

  salesOverTime: [],
  salesOverTimeStatus: "idle",
  salesGroupBy: "hour",

  byCategory: [],
  byCategoryStatus: "idle",

  byFloor: [],
  byFloorStatus: "idle",

  byWaiter: [],
  byWaiterStatus: "idle",

  topItems: [],
  topItemsStatus: "idle",
  topItemsSort: "amount",

  bottomItems: [],
  bottomItemsStatus: "idle",

  byPaymentMethod: [],
  byPaymentMethodStatus: "idle",

  peakHours: [],
  peakHoursStatus: "idle",

  discounts: [],
  discountsStatus: "idle",

  voidedItems: [],
  voidedItemsStatus: "idle",

  dailyClosing: null,
  dailyClosingStatus: "idle",
  dailyClosingDate: todayISO(),
  dailyClosingFloorId: "all",

  setFilters: (newFilters) => {
    set((s) => ({ filters: { ...s.filters, ...newFilters } }));
  },

  setTopItemsSort: (sort) => {
    set({ topItemsSort: sort });
  },

  setDailyClosingParams: (date, floorId) => {
    set({ dailyClosingDate: date, dailyClosingFloorId: floorId });
  },

  fetchSummary: async () => {
    const filters = get().filters;
    set({ summaryStatus: "loading", summaryError: null });
    try {
      const data = await reportsService.summary(filters);
      set({ summary: data, summaryStatus: "success", updatedAt: Date.now() });
    } catch (err: unknown) {
      set({ summaryStatus: "error", summaryError: err instanceof Error ? err.message : "Failed" });
    }
  },

  fetchSalesOverTime: async (groupBy) => {
    const filters = get().filters;
    const gb = groupBy || get().salesGroupBy;
    set({ salesOverTimeStatus: "loading", salesGroupBy: gb });
    try {
      const data = await reportsService.salesOverTime(filters, gb);
      set({ salesOverTime: data, salesOverTimeStatus: "success" });
    } catch {
      set({ salesOverTimeStatus: "error" });
    }
  },

  fetchByCategory: async () => {
    set({ byCategoryStatus: "loading" });
    try {
      const data = await reportsService.byCategory(get().filters);
      set({ byCategory: data, byCategoryStatus: "success" });
    } catch {
      set({ byCategoryStatus: "error" });
    }
  },

  fetchByFloor: async () => {
    set({ byFloorStatus: "loading" });
    try {
      const data = await reportsService.byFloor(get().filters);
      set({ byFloor: data, byFloorStatus: "success" });
    } catch {
      set({ byFloorStatus: "error" });
    }
  },

  fetchByWaiter: async () => {
    set({ byWaiterStatus: "loading" });
    try {
      const data = await reportsService.byWaiter(get().filters);
      set({ byWaiter: data, byWaiterStatus: "success" });
    } catch {
      set({ byWaiterStatus: "error" });
    }
  },

  fetchTopItems: async (sort) => {
    const s = sort || get().topItemsSort;
    set({ topItemsStatus: "loading", topItemsSort: s });
    try {
      const data = await reportsService.topItems(get().filters, { sort: s, order: "desc", limit: 20 });
      set({ topItems: data, topItemsStatus: "success" });
    } catch {
      set({ topItemsStatus: "error" });
    }
  },

  fetchBottomItems: async () => {
    set({ bottomItemsStatus: "loading" });
    try {
      const data = await reportsService.topItems(get().filters, { sort: "qty", order: "asc", limit: 10 });
      set({ bottomItems: data, bottomItemsStatus: "success" });
    } catch {
      set({ bottomItemsStatus: "error" });
    }
  },

  fetchByPaymentMethod: async () => {
    set({ byPaymentMethodStatus: "loading" });
    try {
      const data = await reportsService.byPaymentMethod(get().filters);
      set({ byPaymentMethod: data, byPaymentMethodStatus: "success" });
    } catch {
      set({ byPaymentMethodStatus: "error" });
    }
  },

  fetchPeakHours: async () => {
    set({ peakHoursStatus: "loading" });
    try {
      const data = await reportsService.peakHours(get().filters);
      set({ peakHours: data, peakHoursStatus: "success" });
    } catch {
      set({ peakHoursStatus: "error" });
    }
  },

  fetchDiscounts: async () => {
    set({ discountsStatus: "loading" });
    try {
      const data = await reportsService.discounts(get().filters);
      set({ discounts: data, discountsStatus: "success" });
    } catch {
      set({ discountsStatus: "error" });
    }
  },

  fetchVoidedItems: async () => {
    set({ voidedItemsStatus: "loading" });
    try {
      const data = await reportsService.voidedItems(get().filters);
      set({ voidedItems: data, voidedItemsStatus: "success" });
    } catch {
      set({ voidedItemsStatus: "error" });
    }
  },

  fetchDailyClosing: async () => {
    const { dailyClosingDate, dailyClosingFloorId } = get();
    set({ dailyClosingStatus: "loading" });
    try {
      const data = await reportsService.dailyClosing(
        dailyClosingDate,
        dailyClosingFloorId === "all" ? undefined : dailyClosingFloorId
      );
      set({ dailyClosing: data, dailyClosingStatus: "success" });
    } catch {
      set({ dailyClosingStatus: "error" });
    }
  },

  fetchOverview: async () => {
    const { fetchSummary, fetchSalesOverTime, fetchByCategory, fetchByFloor, fetchByPaymentMethod, fetchTopItems } = get();
    await Promise.allSettled([
      fetchSummary(),
      fetchSalesOverTime(),
      fetchByCategory(),
      fetchByFloor(),
      fetchByPaymentMethod(),
      fetchTopItems(),
    ]);
  },

  invalidateAll: () => {
    set({
      summary: null,
      summaryStatus: "idle",
      salesOverTime: [],
      salesOverTimeStatus: "idle",
      byCategory: [],
      byCategoryStatus: "idle",
      byFloor: [],
      byFloorStatus: "idle",
      byWaiter: [],
      byWaiterStatus: "idle",
      topItems: [],
      topItemsStatus: "idle",
      bottomItems: [],
      bottomItemsStatus: "idle",
      byPaymentMethod: [],
      byPaymentMethodStatus: "idle",
      peakHours: [],
      peakHoursStatus: "idle",
      discounts: [],
      discountsStatus: "idle",
      voidedItems: [],
      voidedItemsStatus: "idle",
      dailyClosing: null,
      dailyClosingStatus: "idle",
    });
  },
}));
