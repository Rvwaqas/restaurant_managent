import * as React from "react";
import { type LucideIcon, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState placeholder when a query or filter returns no items.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-white rounded-2xl border-2 border-dashed border-border select-none",
        className
      )}
    >
      <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 mb-4">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

