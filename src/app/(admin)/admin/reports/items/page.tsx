"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useReportsStore } from "@/store";
import { formatMoney } from "@/utils/money";
import { Button } from "@/components/ui/button";
import { exportToCsv, buildCsvFilename } from "@/lib/export/csv";
import { Download, UtensilsCrossed, ArrowUpDown, AlertCircle } from "lucide-react";
import type { CategorySalesRow, TopItemRow } from "@/types";

const TopItemsBar = dynamic(() => import("@/components/reports/top-items-bar"), {
  ssr: false,
  loading: () => <div className="h-80 bg-gray-50/50 rounded-2xl animate-pulse" />,
});

const CategoryDonut = dynamic(() => import("@/components/reports/category-donut"), {
  ssr: false,
  loading: () => <div className="h-64 bg-gray-50/50 rounded-2xl animate-pulse" />,
});

export default function ReportsItemsPage() {
  const {
    filters,
    topItems,
    topItemsStatus,
    bottomItems,
    bottomItemsStatus,
    byCategory,
    byCategoryStatus,
    fetchTopItems,
    fetchBottomItems,
    fetchByCategory,
  } = useReportsStore();

  const [categorySortKey, setCategorySortKey] = useState<keyof CategorySalesRow>("amount");
  const [categorySortAsc, setCategorySortAsc] = useState(false);

  useEffect(() => {
    fetchTopItems();
    fetchBottomItems();
    fetchByCategory();
  }, [filters, fetchTopItems, fetchBottomItems, fetchByCategory]);

  const handleExportItemsCsv = () => {
    if (!topItems.length) return;
    const rows = topItems.map((item, idx) => ({
      Rank: idx + 1,
      Name: item.name,
      Category: item.categoryName,
      Floor: item.floorId.toUpperCase(),
      "Units Sold": item.qty,
      "Total Revenue": item.amount,
    }));
    exportToCsv(rows, buildCsvFilename("dishes-performance", filters.from, filters.to));
  };

  const handleExportCategoriesCsv = () => {
    if (!byCategory.length) return;
    const rows = byCategory.map((cat) => ({
      Category: cat.name,
      Floor: cat.floorId.toUpperCase(),
      "Dishes Sold": cat.qty,
      "Total Revenue": cat.amount,
      "Share %": `${cat.sharePercent.toFixed(1)}%`,
    }));
    exportToCsv(rows, buildCsvFilename("categories-breakdown", filters.from, filters.to));
  };

  // Sort categories
  const sortedCategories = [...byCategory].sort((a, b) => {
    const valA = a[categorySortKey];
    const valB = b[categorySortKey];
    if (typeof valA === "number" && typeof valB === "number") {
      return categorySortAsc ? valA - valB : valB - valA;
    }
    return categorySortAsc
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  const toggleCategorySort = (key: keyof CategorySalesRow) => {
    if (categorySortKey === key) {
      setCategorySortAsc(!categorySortAsc);
    } else {
      setCategorySortKey(key);
      setCategorySortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Chart + Donut Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-border p-6 shadow-sm">
          <TopItemsBar data={topItems} loading={topItemsStatus === "loading"} />
        </div>
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-gray-900 mb-2">Category Share</h3>
            <p className="text-xs text-muted-foreground mb-4">Proportion of total menu revenue</p>
            <CategoryDonut data={byCategory} loading={byCategoryStatus === "loading"} />
          </div>
        </div>
      </div>

      {/* Category Performance Table */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Category Sales Breakdown</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comparison across Halal (Floor 1) and Non-Halal (Floor 2) food &amp; drink sections
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCategoriesCsv}
            className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-border select-none">
              <tr>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleCategorySort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>Category Name</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3 px-4">Floor</th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleCategorySort("qty")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Dishes Sold</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleCategorySort("amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Revenue</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleCategorySort("sharePercent")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Revenue Share</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedCategories.map((c) => (
                <tr key={c.categoryId} className="hover:bg-gray-50/70 transition-colors">
                  <td className="py-3 px-4 font-bold text-gray-900">{c.name}</td>
                  <td className="py-3 px-4 text-muted-foreground uppercase">{c.floorId}</td>
                  <td className="py-3 px-4 text-right font-medium text-gray-700">{c.qty}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                    {formatMoney(c.amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-primary font-semibold">
                    {c.sharePercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Dishes / Slow Movers */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Slow Selling Dishes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Low-demand menu items to evaluate for menu engineering or promotions
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportItemsCsv}
            className="min-h-[40px] px-3.5 rounded-xl text-xs border-border gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export All Dishes</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {bottomItems.slice(0, 9).map((item) => (
            <div
              key={item.menuItemId}
              className="p-3 rounded-xl border border-border bg-gray-50/50 flex items-center justify-between text-xs"
            >
              <div>
                <p className="font-bold text-gray-900">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">{item.categoryName} ({item.floorId.toUpperCase()})</p>
              </div>
              <div className="text-right">
                <p className="font-bold font-mono text-gray-900">
                  {item.qty === 0 ? (
                    <span className="text-amber-700 text-[11px] font-semibold">0 sold</span>
                  ) : (
                    `${item.qty} sold`
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">{formatMoney(item.amount)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

