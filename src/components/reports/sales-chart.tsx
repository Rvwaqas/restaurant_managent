"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatMoney } from "@/utils/money";
import { CURRENCY_SYMBOL } from "@/config/app";
import type { SalesOverTimeBucket } from "@/types";
import { cn } from "@/lib/utils";

interface SalesChartProps {
  data: SalesOverTimeBucket[];
  groupBy?: "hour" | "day" | "month";
  loading?: boolean;
}

export function SalesChart({ data, groupBy = "day", loading = false }: SalesChartProps) {
  const [metric, setMetric] = useState<"amount" | "bills">("amount");
  const [chartType, setChartType] = useState<"area" | "bar">("area");

  if (loading) {
    return (
      <div className="h-80 w-full flex items-center justify-center bg-gray-50/50 rounded-2xl animate-pulse">
        <span className="text-xs text-muted-foreground font-semibold">Loading chart data...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-80 w-full flex flex-col items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-border text-center p-6">
        <p className="text-sm font-semibold text-gray-700">No sales recorded for this period</p>
        <p className="text-xs text-muted-foreground mt-1">Try selecting a different date range or filter</p>
      </div>
    );
  }

  // Format label for X-Axis based on groupBy
  const formattedData = data.map((d) => {
    let displayLabel = d.bucket;
    if (groupBy === "hour") {
      // "2026-11-05T14:00" -> "14:00"
      displayLabel = d.bucket.includes("T") ? d.bucket.split("T")[1] : d.bucket;
    } else if (groupBy === "day") {
      // "2026-11-05" -> "Nov 05"
      const parts = d.bucket.split("-");
      if (parts.length === 3) {
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        displayLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
      }
    }
    return {
      ...d,
      displayLabel,
    };
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMetric("amount")}
            className={cn(
              "min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all",
              metric === "amount" ? "bg-white text-gray-900 shadow-sm font-bold" : "text-gray-600 hover:text-gray-900"
            )}
          >
            Revenue (PKR)
          </button>
          <button
            type="button"
            onClick={() => setMetric("bills")}
            className={cn(
              "min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all",
              metric === "bills" ? "bg-white text-gray-900 shadow-sm font-bold" : "text-gray-600 hover:text-gray-900"
            )}
          >
            Bills Count
          </button>
        </div>

        <div className="inline-flex bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setChartType("area")}
            className={cn(
              "min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
              chartType === "area" ? "bg-white text-gray-900 shadow-sm font-bold" : "text-gray-600 hover:text-gray-900"
            )}
          >
            Area View
          </button>
          <button
            type="button"
            onClick={() => setChartType("bar")}
            className={cn(
              "min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
              chartType === "bar" ? "bg-white text-gray-900 shadow-sm font-bold" : "text-gray-600 hover:text-gray-900"
            )}
          >
            Bar View
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div className="h-80 w-full" aria-label="Sales over time trend chart">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "area" ? (
            <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="displayLabel"
                tick={{ fontSize: 11, fill: "#6B7280" }}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6B7280" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => (metric === "amount" ? `${CURRENCY_SYMBOL} ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}` : String(val))}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as SalesOverTimeBucket & { displayLabel: string };
                    return (
                      <div className="bg-white border border-border rounded-xl p-3 shadow-lg text-xs space-y-1">
                        <p className="font-bold text-gray-900">{item.bucket}</p>
                        <p className="text-primary font-semibold font-mono">
                          Revenue: {formatMoney(item.grandTotal)}
                        </p>
                        <p className="text-gray-600">
                          Bills: <span className="font-semibold">{item.billsCount}</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey={metric === "amount" ? "grandTotal" : "billsCount"}
                stroke="#4F46E5"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#salesGradient)"
              />
            </AreaChart>
          ) : (
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="displayLabel"
                tick={{ fontSize: 11, fill: "#6B7280" }}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6B7280" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => (metric === "amount" ? `${CURRENCY_SYMBOL} ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}` : String(val))}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as SalesOverTimeBucket & { displayLabel: string };
                    return (
                      <div className="bg-white border border-border rounded-xl p-3 shadow-lg text-xs space-y-1">
                        <p className="font-bold text-gray-900">{item.bucket}</p>
                        <p className="text-primary font-semibold font-mono">
                          Revenue: {formatMoney(item.grandTotal)}
                        </p>
                        <p className="text-gray-600">
                          Bills: <span className="font-semibold">{item.billsCount}</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey={metric === "amount" ? "grandTotal" : "billsCount"}
                fill="#4F46E5"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
export default SalesChart;

