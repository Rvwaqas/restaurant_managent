import * as React from "react";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: number;
    isPositive?: boolean;
    label?: string;
  };
  icon?: LucideIcon;
  className?: string;
}

/**
 * Metric KPI card for reports, dashboard, and floor overview.
 */
export function StatCard({
  label,
  value,
  subtext,
  trend,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "p-5 bg-white rounded-2xl border-2 border-border shadow-xs hover:shadow-sm transition-all select-none flex flex-col justify-between",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-primary shrink-0">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-3xl font-extrabold text-gray-900 tracking-tight tabular-nums">
          {value}
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-bold px-2 py-0.5 rounded-full",
                trend.isPositive !== false
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              )}
            >
              {trend.isPositive !== false ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{Math.abs(trend.value)}%</span>
            </span>
          )}

          {subtext && (
            <span className="text-muted-foreground font-medium truncate">
              {subtext}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

