import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tablet-optimized Button component.
 * Default size is 48px height minimum to ensure ergonomic touch interaction.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
        default: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
        secondary: "bg-secondary text-secondary-foreground hover:bg-gray-200 border border-border shadow-sm",
        outline: "border-2 border-border bg-white text-gray-800 hover:bg-gray-50 hover:border-gray-300",
        ghost: "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive-hover shadow-sm",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover shadow-sm",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "min-h-[40px] px-3.5 py-1.5 text-sm rounded-lg",
        md: "min-h-[48px] px-5 py-2.5 text-base rounded-xl",
        lg: "min-h-[56px] px-6 py-3.5 text-lg rounded-xl",
        xl: "min-h-[64px] px-8 py-4 text-xl rounded-2xl",
        default: "min-h-[48px] px-5 py-2.5 text-base rounded-xl",
        icon: "min-h-[48px] min-w-[48px] p-2.5 rounded-xl",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, loading = false, disabled, children, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin mr-2 shrink-0" />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
