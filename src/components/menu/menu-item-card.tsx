"use client";

import * as React from "react";
import Image from "next/image";
import { Utensils, Plus, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";

export interface MenuItemCardProps {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  subcategory?: string | null;
  available?: boolean;
  cartQuantity?: number;
  onClick?: () => void;
  onOptionsClick?: () => void;
  className?: string;
}

/**
 * Dish / Menu item tile optimized for rapid touch ordering on tablets.
 * Whole card is clickable (+1 add); includes customize icon for notes and quantity adjustments.
 */
export function MenuItemCard({
  name,
  price,
  image,
  subcategory,
  available = true,
  cartQuantity = 0,
  onClick,
  onOptionsClick,
  className,
}: MenuItemCardProps) {
  const [imgError, setImgError] = React.useState(false);
  const inCart = cartQuantity > 0;

  return (
    <div
      onClick={available ? onClick : undefined}
      className={cn(
        "group relative flex flex-col justify-between w-full min-h-[210px] p-3 rounded-2xl border-2 bg-white text-left transition-all duration-150 select-none shadow-sm hover:shadow-md",
        available
          ? "border-border hover:border-primary/40 active:scale-[0.98] cursor-pointer"
          : "border-gray-200 bg-gray-50/70 opacity-60 cursor-not-allowed",
        inCart && available && "border-primary ring-2 ring-primary/20",
        className
      )}
    >
      {/* Top Media / Thumbnail */}
      <div className="relative w-full h-32 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
        {image && !imgError ? (
          <Image
            src={image}
            alt={name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
            <Utensils className="h-8 w-8 mb-1 opacity-40" />
            <span className="text-[11px] font-medium opacity-60">No photo</span>
          </div>
        )}

        {/* In-cart count badge */}
        {inCart && available && (
          <div className="absolute top-2 right-2 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-primary text-white text-xs font-extrabold shadow-md tabular-nums ring-2 ring-white">
            x{cartQuantity}
          </div>
        )}

        {/* Unavailable overlay badge */}
        {!available && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-2">
            <span className="px-3 py-1 rounded-full bg-black/70 text-white text-xs font-bold uppercase tracking-wider">
              Sold Out
            </span>
          </div>
        )}
      </div>

      {/* Item info */}
      <div className="mt-2.5 flex-1 flex flex-col justify-between">
        <div>
          {subcategory && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
              {subcategory}
            </span>
          )}
          <h4 className="text-base font-bold text-gray-900 line-clamp-2 leading-snug">
            {name}
          </h4>
        </div>

        {/* Footer: Price + Actions */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-base font-extrabold text-primary tabular-nums">
            {formatMoney(price)}
          </span>

          {available && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {onOptionsClick && (
                <button
                  type="button"
                  title="Customize options & notes"
                  onClick={onOptionsClick}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={onClick}
                aria-label={`Add ${name}`}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                  inCart
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-primary hover:text-white"
                )}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
