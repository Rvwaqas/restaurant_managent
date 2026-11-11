import { Page, expect } from "@playwright/test";

export type StaffRole = "admin" | "waiter1" | "waiter3";

const CREDENTIALS: Record<StaffRole, { user: string; pass: string; defaultPath: string }> = {
  admin: { user: "admin", pass: "admin123", defaultPath: "/admin/menu" },
  waiter1: { user: "waiter1", pass: "1234", defaultPath: "/floor-1" },
  waiter3: { user: "waiter3", pass: "1234", defaultPath: "/floor-1" },
};

/**
 * Logs in as staff role through the actual UI form.
 */
export async function loginAs(page: Page, role: StaffRole, expectedRedirect?: string): Promise<void> {
  const creds = CREDENTIALS[role];
  if (!creds) {
    throw new Error(`Unknown role for login: ${role}`);
  }

  // Navigate to login
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for React hydration
  await page.waitForSelector('form[data-hydrated="true"]', { timeout: 10000 });
  await page.waitForTimeout(100);

  const userField = page.locator("#username");
  const passField = page.locator("#password");
  await expect(userField).toBeVisible({ timeout: 10000 });
  await expect(userField).toBeEditable({ timeout: 5000 });
  await userField.fill("");
  await userField.fill(creds.user);
  await userField.dispatchEvent("input");
  await expect(userField).toHaveValue(creds.user);

  await passField.fill("");
  await passField.fill(creds.pass);
  await passField.dispatchEvent("input");
  await expect(passField).toHaveValue(creds.pass);

  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeEnabled({ timeout: 5000 });

  await Promise.all([
    page.waitForURL((url) => {
      const path = url.pathname;
      if (expectedRedirect) {
        return path === expectedRedirect || path.startsWith(expectedRedirect);
      }
      return path.startsWith("/floor-") || path.startsWith("/admin");
    }, { timeout: 15000 }),
    submitBtn.click(),
  ]);
}

/**
 * Clears stored auth tokens and cookies in the browser context.
 */
export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  try {
    if (page.url() && !page.url().startsWith("about:")) {
      await page.evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {}
      });
    }
  } catch {}
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  }).catch(() => {});
}
