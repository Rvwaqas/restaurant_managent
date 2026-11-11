import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onChange, onClear, placeholder = "Search...", ...props }, ref) => {
    return (
      <div className={cn("relative flex items-center w-full", className)}>
        <Search className="absolute left-4 h-5 w-5 text-muted-foreground pointer-events-none" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex h-12 w-full rounded-xl border-2 border-border bg-white pl-12 pr-12 py-2.5 text-base text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        {value.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onChange("");
              if (onClear) onClear();
            }}
            className="absolute right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";

