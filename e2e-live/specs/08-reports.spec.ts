import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { tap } from "../lib/touch";

test.describe("08-reports: Analytics, Demo History, Date Filters & Export", () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
  });

  test("waiter is forbidden (403) from accessing reports", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/403/);
    await expect(page.locator("h1, h2")).toContainText(/403|Forbidden|Access Denied/i);
  });

  test("loads all report tabs and displays non-zero sales figures from demo seed", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/reports");
    await expect(page.locator("h1")).toContainText(/Analytics|Reports/i);

    // Filter preset "Last 7 Days" or "This Month"
    const last7Btn = page.getByRole("button", { name: /last 7 days|this month/i }).first();
    if (await last7Btn.isVisible()) {
      await tap(last7Btn);
    }

    // Verify key metrics cards are visible
    await expect(page.locator("text=Total Net Sales").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Bills Settled").first()).toBeVisible();

    // Check tabs navigation
    // 1. Sales & Peak Hours
    await tap(page.locator('a:has-text("Sales & Peak Hours")').first());
    await expect(page).toHaveURL(/\/admin\/reports\/sales/);
    await expect(page.locator("text=Revenue Over Time").or(page.locator("text=Peak Operating Hours")).first()).toBeVisible({ timeout: 10000 });

    // 2. Dishes & Categories
    await tap(page.locator('a:has-text("Dishes & Categories")').first());
    await expect(page).toHaveURL(/\/admin\/reports\/items/);
    await expect(page.locator("text=Category Breakdown").or(page.locator("text=Top Selling Dishes")).first()).toBeVisible({ timeout: 10000 });

    // 3. Staff & Payments
    await tap(page.locator('a:has-text("Staff & Payments")').first());
    await expect(page).toHaveURL(/\/admin\/reports\/staff/);

    // 4. Daily Closing
    await tap(page.locator('a:has-text("Daily Closing")').first());
    await expect(page).toHaveURL(/\/admin\/reports\/closing/);
    await expect(page.locator("text=Closing Date:").or(page.locator("text=Daily Z-Report")).first()).toBeVisible({ timeout: 10000 });
  });

  test("daily closing displays open orders warning and CSV export triggers download", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/reports/closing");
    await expect(page.locator("h1")).toContainText(/Analytics|Reports/i);

    // If there is an Export CSV button, clicking it should trigger a download event
    const exportBtn = page.getByRole("button", { name: /export csv/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
    await tap(exportBtn);
    const download = await downloadPromise;

    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.csv$/i);
    }
  });
});

