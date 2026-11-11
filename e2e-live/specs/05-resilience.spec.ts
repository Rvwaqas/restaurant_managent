import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { restartBackend, sleep } from "../lib/stack";
import { getOpenOrderForTableApi, listPaidOrdersApi } from "../lib/api";
import { listPrintSimSlips, clearPrintSimSlips } from "../lib/printSim";
import { tap } from "../lib/touch";

test.describe("05-resilience: Disconnect Recovery, Offline Mode & Idempotency", () => {
  test.beforeEach(async ({ page }) => {
    clearPrintSimSlips();
    await logout(page);
  });

  test("connection banner appears when offline and draft cart survives reload", async ({ context, page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    // Open Table 1
    const table1 = page.locator('[data-table-number="1"], [data-table-id="t1"]').first();
    await expect(table1).toBeVisible({ timeout: 10000 });
    await tap(table1);
    await expect(page).toHaveURL(/\/floor-1\/table\/t1/);

    // Add item to cart
    const itemCard = page.locator('button:has-text("Chicken Biryani"), [data-testid="item-card-i1"]').first();
    await expect(itemCard).toBeVisible({ timeout: 10000 });
    await tap(itemCard);

    // Cart shows 1 item
    await expect(page.locator("text=Chicken Biryani").first()).toBeVisible();

    // Simulate browser offline
    await context.setOffline(true);

    // Connection banner appears
    const banner = page.locator('[role="status"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText(/offline|unstable|cannot be sent/i);

    // Send button should be disabled while offline
    const sendBtn = page.getByRole("button", { name: /send to kitchen/i });
    if (await sendBtn.isVisible()) {
      await expect(sendBtn).toBeDisabled();
    }

    // Reload page while offline: draft cart must persist in localStorage
    await page.reload();
    await expect(page.locator("text=Chicken Biryani").first()).toBeVisible({ timeout: 10000 });

    // Restore online
    await context.setOffline(false);
    await expect(banner).toBeHidden({ timeout: 10000 });

    // Send button becomes enabled
    if (await sendBtn.isVisible()) {
      await expect(sendBtn).toBeEnabled({ timeout: 5000 });
    }
  });

  test("backend restart mid-session triggers reconnect and re-syncs state without page reload", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    const table2 = page.locator('[data-table-number="2"], [data-table-id="t2"]').first();
    await expect(table2).toBeVisible({ timeout: 10000 });

    // Restart backend mid-session
    await restartBackend();

    // Verify UI recovers and tables are interactive without manual reload
    await expect(table2).toBeVisible({ timeout: 15000 });
    await tap(table2);
    await expect(page).toHaveURL(/\/floor-1\/table\/t2/);
  });

  test("rapid double-click on Send generates only one KOT and one server batch", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    // Open Table 4
    const table4 = page.locator('[data-table-number="4"], [data-table-id="t4"]').first();
    await expect(table4).toBeVisible({ timeout: 10000 });
    await tap(table4);
    await expect(page).toHaveURL(/\/floor-1\/table\/t4/);

    // Add Garlic Naan
    const naan = page.locator('button:has-text("Garlic Naan"), [data-testid="item-card-i4"]').first();
    await expect(naan).toBeVisible({ timeout: 10000 });
    await tap(naan);

    const sendBtn = page.getByRole("button", { name: /send to kitchen/i });
    await expect(sendBtn).toBeEnabled({ timeout: 5000 });

    // Rapid double-click on Send
    await Promise.all([
      sendBtn.click({ clickCount: 2, delay: 20 }),
    ]);

    // Send result dialog should appear
    await expect(page.locator("text=Batch #1 Sent!")).toBeVisible({ timeout: 10000 });

    // Check backend open order for table t4: should have exactly 1 batch
    await sleep(500);
    const openOrder = await getOpenOrderForTableApi("t4");
    expect(openOrder).not.toBeNull();
    expect(openOrder?.batches?.length).toBe(1);

    // Check print_sim: should only have 1 KOT slip for this batch
    const slips = listPrintSimSlips();
    const kots = slips.filter((s) => s.type === "kot" && s.content.includes("Garlic Naan"));
    expect(kots.length).toBe(1);
  });
});

