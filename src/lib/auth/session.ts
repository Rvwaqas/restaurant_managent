/**
 * Helper to manage client-side cookies for Next.js Middleware route guards.
 * Note: Since this is an offline/local WiFi PWA, these cookies mirror the auth session
 * so Edge/Node Middleware can read `pos_token` and `pos_role` without reading localStorage.
 */

export interface SessionCookies {
  token?: string;
  role?: string;
}

const COOKIE_TOKEN = "pos_token";
const COOKIE_ROLE = "pos_role";

export function setSessionCookies(
  token: string,
  role: string,
  expiresAt?: string | null
): void {
  if (typeof document === "undefined") return;

  let expiresClause = "";
  if (expiresAt) {
    const expDate = new Date(expiresAt);
    if (!isNaN(expDate.getTime())) {
      expiresClause = `expires=${expDate.toUTCString()}; `;
    }
  }

  // 12 hours default fallback if no expiresAt provided
  if (!expiresClause) {
    const fallbackExp = new Date(Date.now() + 12 * 60 * 60 * 1000);
    expiresClause = `expires=${fallbackExp.toUTCString()}; `;
  }

  const baseFlags = `path=/; ${expiresClause}SameSite=Lax`;
  document.cookie = `${COOKIE_TOKEN}=${encodeURIComponent(token)}; ${baseFlags}`;
  document.cookie = `${COOKIE_ROLE}=${encodeURIComponent(role)}; ${baseFlags}`;
}

export function clearSessionCookies(): void {
  if (typeof document === "undefined") return;

  const expireImmediately = "path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax";
  document.cookie = `${COOKIE_TOKEN}=; ${expireImmediately}`;
  document.cookie = `${COOKIE_ROLE}=; ${expireImmediately}`;
}

export function getSessionCookies(): SessionCookies {
  if (typeof document === "undefined") return {};

  const cookies = document.cookie ? document.cookie.split("; ") : [];
  const result: SessionCookies = {};

  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    const value = rest.join("=");
    if (name === COOKIE_TOKEN) {
      result.token = decodeURIComponent(value);
    } else if (name === COOKIE_ROLE) {
      result.role = decodeURIComponent(value);
    }
  }

  return result;
}

export function isSessionExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return true;
  if (expiresAt === "12h" || expiresAt.endsWith("h")) return false;
  const expTime = new Date(expiresAt).getTime();
  if (isNaN(expTime)) return false;
  return expTime <= Date.now();
}

