"use client";

import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { CategorySalesRow } from "@/types";
import { formatMoney } from "@/utils/money";

interface CategoryDonutProps {
  data: CategorySalesRow[];
  loading?: boolean;
}

// Calming, professional color palette (strictly no status red/green)
const PALETTE = [
  "#4F46E5", // indigo-600
  "#6366F1", // indigo-500
  "#818CF8", // indigo-400
  "#3B82F6", // blue-500
  "#0EA5E9", // sky-500
  "#64748B", // slate-500
  "#8B5CF6", // purple-500
  "#A855F7", // purple-600
];

export function CategoryDonut({ data, loading = false }: CategoryDonutProps) {
  if (loading) {
    return (
      <div className="h-64 w-full flex items-center justify-center bg-gray-50/50 rounded-2xl animate-pulse">
        <span className="text-xs text-muted-foreground font-semibold">Loading category breakdown...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-64 w-full flex items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-border text-center p-6">
        <p className="text-xs text-muted-foreground">No category sales recorded</p>
      </div>
    );
  }

  const chartData = data.map((d, index) => ({
    name: d.name,
    value: d.amount,
    qty: d.qty,
    share: d.sharePercent,
    color: PALETTE[index % PALETTE.length],
  }));

  return (
    <div className="space-y-4">
      <div className="h-56 w-full relative" aria-label="Category sales distribution donut chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-white border border-border rounded-xl p-2.5 shadow-md text-xs space-y-0.5">
                      <p className="font-bold text-gray-900">{item.name}</p>
                      <p className="text-primary font-semibold font-mono">{formatMoney(item.value)}</p>
                      <p className="text-muted-foreground">
                        {item.qty} items · {item.share.toFixed(1)}% share
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend list */}
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {chartData.map((item) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium text-gray-800">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 font-mono">{formatMoney(item.value)}</span>
              <span className="text-muted-foreground w-12 text-right">({item.share.toFixed(1)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export default CategoryDonut;

