"use client";

import * as React from "react";
import { ShoppingBag, ChevronUp } from "lucide-react";
import { formatMoney } from "@/utils/money";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export interface OrderLayoutProps {
  /** The menu catalog, search bar, category chips, and dish grid */
  menuContent: React.ReactNode;
  /** The CartPanel with items, totals, and bottom action bar */
  cartContent: React.ReactNode;
  /** Number of items currently in cart */
  cartItemCount?: number;
  /** Total bill amount currently in cart */
  cartTotal?: number;
  /** Current table label, e.g. "Table 4" */
  tableLabel?: string;
  className?: string;
}

/**
 * Responsive Split Screen Layout for Restaurant Tablets.
 * - Landscape (>= 1024px): 2 columns (Menu catalog on left, fixed 380px Cart on right).
 * - Portrait (< 1024px): Full-width menu with floating bottom cart sheet triggered via Drawer.
 */
export function OrderLayout({
  menuContent,
  cartContent,
  cartItemCount = 0,
  cartTotal = 0,
  tableLabel,
  className,
}: OrderLayoutProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div
      className={cn(
        "relative flex-1 flex flex-col lg:flex-row h-full overflow-hidden",
        className
      )}
    >
      {/* Menu / Catalog Column (Scrollable) */}
      <section className="flex-1 flex flex-col h-full overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
        {menuContent}
      </section>

      {/* Landscape Cart Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex flex-col w-[380px] xl:w-[420px] h-full shrink-0 border-l border-border bg-white shadow-lg">
        {cartContent}
      </aside>

      {/* Portrait Floating Cart Bar & Bottom Drawer (< 1024px) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-border shadow-2xl z-40 safe-bottom">
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <button
              type="button"
              data-testid="bottom-cart-trigger"
              className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-primary text-white flex items-center justify-between shadow-lg active:scale-[0.98] transition-transform select-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-extrabold leading-none">
                    {tableLabel ? `${tableLabel} Order` : "View Order Cart"}
                  </div>
                  <div className="text-xs text-white/80 mt-1 font-medium">
                    {cartItemCount} {cartItemCount === 1 ? "item" : "items"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tabular-nums">
                  {formatMoney(cartTotal)}
                </span>
                <ChevronUp className="h-5 w-5 opacity-80" />
              </div>
            </button>
          </DrawerTrigger>

          <DrawerContent className="max-h-[88vh] flex flex-col bg-background p-0 rounded-t-3xl border-t-2 border-border select-none">
            <div className="sr-only">
              <DrawerTitle>Order Cart Details</DrawerTitle>
            </div>
            <div className="flex-1 overflow-hidden h-full flex flex-col">
              {cartContent}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}

