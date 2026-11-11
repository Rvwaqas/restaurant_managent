import { CURRENCY_SYMBOL } from "@/config/app";

/**
 * Formats a monetary amount into standard display string using CURRENCY_SYMBOL.
 * All amounts across the POS must pass through formatMoney.
 * E.g. formatMoney(450) -> "Rs 450.00"
 */
export function formatMoney(amount: number | null | undefined): string {
  const val = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return `${CURRENCY_SYMBOL} ${val.toFixed(2)}`;
}
