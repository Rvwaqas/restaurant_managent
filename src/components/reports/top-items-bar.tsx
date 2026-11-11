"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { TopItemRow } from "@/types";
import { formatMoney } from "@/utils/money";
import { cn } from "@/lib/utils";

interface TopItemsBarProps {
  data: TopItemRow[];
  loading?: boolean;
}

export function TopItemsBar({ data, loading = false }: TopItemsBarProps) {
  const [mode, setMode] = useState<"qty" | "amount">("qty");

  if (loading) {
    return (
      <div className="h-80 w-full flex items-center justify-center bg-gray-50/50 rounded-2xl animate-pulse">
        <span className="text-xs text-muted-foreground font-semibold">Loading top dishes...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-80 w-full flex items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-border text-center p-6">
        <p className="text-xs text-muted-foreground">No dishes sold in this period</p>
      </div>
    );
  }

  // Sort and take top 10
  const sorted = [...data]
    .sort((a, b) => (mode === "qty" ? b.qty - a.qty : b.amount - a.amount))
    .slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Top 10 Selling Dishes
        </span>
        <div className="inline-flex bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMode("qty")}
            className={cn(
              "min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-all",
              mode === "qty"
                ? "bg-white text-gray-900 shadow-sm font-bold"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            By Quantity
          </button>
          <button
            type="button"
            onClick={() => setMode("amount")}
            className={cn(
              "min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-all",
              mode === "amount"
                ? "bg-white text-gray-900 shadow-sm font-bold"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            By Revenue
          </button>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="h-80 w-full" aria-label="Top selling menu items horizontal bar chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={sorted}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#6B7280" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
              tickFormatter={(val) => (mode === "amount" ? `Rs ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}` : String(val))}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "#374151" }}
              tickLine={false}
              axisLine={false}
              width={110}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload as TopItemRow;
                  return (
                    <div className="bg-white border border-border rounded-xl p-2.5 shadow-lg text-xs space-y-1">
                      <p className="font-bold text-gray-900">{item.name}</p>
                      <p className="text-muted-foreground">{item.categoryName} ({item.floorId.toUpperCase()})</p>
                      <p className="text-primary font-semibold font-mono">
                        Revenue: {formatMoney(item.amount)}
                      </p>
                      <p className="text-gray-700">
                        Units Sold: <span className="font-bold">{item.qty}</span>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey={mode === "qty" ? "qty" : "amount"}
              fill="#4F46E5"
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
export default TopItemsBar;

