import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { getApiBaseUrl } from "../lib/api";

test.describe("01-auth: Authentication & Role Boundary Checks", () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
  });

  test("displays error message on invalid password", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('form[data-hydrated="true"]', { timeout: 10000 });
    await page.waitForTimeout(200);
    const userField = page.locator("#username");
    const passField = page.locator("#password");
    await expect(userField).toBeEditable();
    await userField.fill("admin");
    await passField.fill("wrongpassword123");
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    const errBanner = page.locator(".bg-red-50");
    await expect(errBanner).toBeVisible({ timeout: 5000 });
    await expect(errBanner).toContainText(/invalid/i);
  });

  test("admin lands on admin area (/admin/menu)", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page).toHaveURL(/\/admin\/menu/);
  });

  test("waiter lands on assigned floor (/floor-1)", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);
  });

  test("waiter3 is blocked from /floor-2 and /admin (403 page)", async ({ page }) => {
    await loginAs(page, "waiter3");
    await expect(page).toHaveURL(/\/floor-1/);

    // Try navigating to floor-2 (waiter3 allowed only on floor-1)
    await page.goto("/floor-2");
    await expect(page).toHaveURL(/\/403/);
    await expect(page.locator("h1, h2")).toContainText(/403|Forbidden|Access Denied/i);

    // Try navigating to admin route
    await page.goto("/admin/menu");
    await expect(page).toHaveURL(/\/403/);
  });

  test("unauthenticated /floor-1 redirects to login with redirect param and returns after login", async ({ page }) => {
    await page.goto("/floor-1");
    await expect(page).toHaveURL(/\/login\?redirect=%2Ffloor-1/);

    await page.waitForSelector('form[data-hydrated="true"]', { timeout: 10000 });
    // Log in as waiter1
    await page.fill("#username", "waiter1");
    await page.fill("#password", "1234");
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await expect(page).toHaveURL(/\/floor-1/);
  });

  test("expired token logs out and presents session expired notice", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    // Tamper the stored auth token & expiry in localStorage
    await page.evaluate(() => {
      const raw = localStorage.getItem("auth-storage");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.state.expiresAt = new Date(Date.now() - 3600000).toISOString();
        localStorage.setItem("auth-storage", JSON.stringify(parsed));
      }
      document.cookie = "pos_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax";
    });

    // Trigger re-check by reloading page
    await page.reload();

    // Verify redirected to login and toast appears
    await expect(page).toHaveURL(/\/login/);
    const toastElem = page.locator("text=Session Expired").first();
    await expect(toastElem).toBeVisible({ timeout: 5000 });
  });

  test("login rate limit message displayed after repeated failed attempts", async ({ page }) => {
    const apiUrl = getApiBaseUrl();

    // Trigger 5 rapid failed login attempts on backend to trip rate limit
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "rate_limit_user", password: "bad" }),
      });
      await res.text();
    }

    // Now attempt 6th failed login through the UI
    await page.goto("/login");
    await page.waitForSelector('form[data-hydrated="true"]', { timeout: 10000 });
    await page.fill("#username", "rate_limit_user");
    await page.fill("#password", "badpassword");
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    const errBanner = page.locator(".bg-red-50");
    await expect(errBanner).toBeVisible({ timeout: 5000 });
    await expect(errBanner).toContainText(/too many login attempts|wait 60 seconds/i);
  });
});
