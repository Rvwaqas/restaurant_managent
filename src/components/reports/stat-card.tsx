"use client";

import React, { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number; // e.g. 12.5 means +12.5%
  changeLabel?: string;
  icon?: ReactNode;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  change,
  changeLabel = "vs previous period",
  icon,
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-border p-5 shadow-sm animate-pulse min-h-[130px] flex flex-col justify-between">
        <div className="flex justify-between items-center">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="w-8 h-8 rounded-xl bg-gray-100" />
        </div>
        <div className="h-8 w-32 bg-gray-200 rounded mt-3" />
        <div className="h-3 w-40 bg-gray-100 rounded mt-2" />
      </div>
    );
  }

  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isZero = change !== undefined && change === 0;

  return (
    <div className="bg-white rounded-2xl border border-border p-5 shadow-sm flex flex-col justify-between min-h-[130px] transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2">
        <div className="text-2xl font-black text-gray-900 tracking-tight font-mono tabular-nums">
          {value}
        </div>

        {change !== undefined ? (
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {isPositive && (
              <span className="inline-flex items-center font-bold text-primary">
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                +{change.toFixed(1)}%
              </span>
            )}
            {isNegative && (
              <span className="inline-flex items-center font-bold text-amber-700">
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                {change.toFixed(1)}%
              </span>
            )}
            {isZero && (
              <span className="inline-flex items-center font-semibold text-gray-500">
                <Minus className="w-3 h-3 mr-0.5" />
                0.0%
              </span>
            )}
            <span className="text-muted-foreground">{changeLabel}</span>
          </div>
        ) : subtitle ? (
          <div className="mt-1 text-xs text-muted-foreground font-medium">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

