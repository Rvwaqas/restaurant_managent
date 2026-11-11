import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center min-w-[48px] min-h-[48px] rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        ghost: "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
        outline: "border-2 border-border bg-white text-gray-800 hover:bg-gray-50",
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
        secondary: "bg-secondary text-secondary-foreground hover:bg-gray-200 border border-border",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
      },
      size: {
        md: "w-12 h-12 text-base",
        lg: "w-14 h-14 text-lg",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  "aria-label": string; // Explicitly enforce aria-label for accessibility
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, "aria-label": ariaLabel, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        className={cn(iconButtonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = "IconButton";

