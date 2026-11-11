import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  actions?: React.ReactNode;
  action?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  className?: string;
}

/**
 * Standard page title banner for admin, waiter, and reports views.
 */
export function PageHeader({
  title,
  subtitle,
  description,
  actions,
  action,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  const displaySubtitle = subtitle || description;
  const displayActions = actions || action;

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-6 border-b border-border select-none",
        className
      )}
    >
      <div>
        {breadcrumbs && <div className="mb-1.5">{breadcrumbs}</div>}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
          {title}
        </h1>
        {displaySubtitle && (
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {displaySubtitle}
          </p>
        )}
      </div>

      {displayActions && (
        <div className="flex items-center gap-2.5 shrink-0">
          {displayActions}
        </div>
      )}
    </div>
  );
}
