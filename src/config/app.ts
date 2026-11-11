export const APP_NAME = "Soufi Restaurant" as const;
export const APP_DESCRIPTION = "Restaurant POS System" as const;
export const TAX_RATE = 0; // Default tax 0 as required
export const SERVICE_CHARGE_RATE = 0; // Default service charge 0
export const CURRENCY_SYMBOL = "RM" as const;
export const DEFAULT_CURRENCY = "MYR" as const;
export const PAYMENT_METHODS = ["cash", "card", "online"] as const;
export const CASHIER_PRINTER_ID = "prn-cashier" as const;

export const BUSINESS_DAY_START_HOUR = 0; // midnight, Karachi time
export const TIMEZONE = "Asia/Karachi";
export const SESSION_LOCK_MINUTES = 30; // auto-lock tablet after 30 minutes of inactivity
