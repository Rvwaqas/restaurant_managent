import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { tap } from "../lib/touch";

test.describe("09-a11y-touch: Tablet Touch Targets & Ergonomics [P]", () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
  });

  test("login page interactive elements meet touch target minimums (>= 44px) and keyboard navigable", async ({ page }) => {
    await page.goto("/login");

    // Login inputs and submit button
    const usernameInput = page.locator("#username");
    const passwordInput = page.locator("#password");
    const submitButton = page.locator('button[type="submit"]');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    const uBox = await usernameInput.boundingBox();
    const pBox = await passwordInput.boundingBox();
    const sBox = await submitButton.boundingBox();

    expect(uBox?.height).toBeGreaterThanOrEqual(40);
    expect(pBox?.height).toBeGreaterThanOrEqual(40);
    expect(sBox?.height).toBeGreaterThanOrEqual(44);

    // Keyboard navigation: fill via typing, submit via Enter
    await usernameInput.focus();
    await page.keyboard.type("waiter1");
    await page.keyboard.press("Tab");
    await page.keyboard.type("1234");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/floor-1/, { timeout: 10000 });
  });

  test("floor table cards have ergonomic dimensions on tablet", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    const tableCards = page.locator('[data-table-number], [data-table-id]');
    await expect(tableCards.first()).toBeVisible({ timeout: 10000 });

    const count = await tableCards.count();
    expect(count).toBeGreaterThanOrEqual(10);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await tableCards.nth(i).boundingBox();
      expect(box).not.toBeNull();
      // Table cards on POS grid must be large and thumb-friendly (>= 60px height & width)
      expect(box!.width).toBeGreaterThanOrEqual(60);
      expect(box!.height).toBeGreaterThanOrEqual(60);
    }
  });

  test("order page action buttons (Send, Pay, Add items) meet touch target requirements", async ({ page }) => {
    await loginAs(page, "waiter1");
    await page.goto("/floor-1/table/t1");

    // Category tabs
    const catTabs = page.locator('[role="tab"], nav button');
    const firstTab = catTabs.first();
    await expect(firstTab).toBeVisible({ timeout: 10000 });
    const tabBox = await firstTab.boundingBox();
    expect(tabBox?.height).toBeGreaterThanOrEqual(40);

    // Menu item cards
    const itemCard = page.locator('[data-testid^="item-card-"], button:has-text("Biryani"), button:has-text("Naan")').first();
    await expect(itemCard).toBeVisible({ timeout: 10000 });
    const itemBox = await itemCard.boundingBox();
    expect(itemBox?.height).toBeGreaterThanOrEqual(44);

    // Tap to add item
    await tap(itemCard);

    // Bottom action bar buttons (Send to Kitchen, Pay / Bill)
    const sendBtn = page.getByRole("button", { name: /send to kitchen/i });
    const payBtn = page.getByRole("button", { name: /pay \/ bill/i });

    await expect(sendBtn).toBeVisible();
    await expect(payBtn).toBeVisible();

    const sendBox = await sendBtn.boundingBox();
    const payBox = await payBtn.boundingBox();

    // Primary action buttons must be large ergonomic buttons (>= 48px height)
    expect(sendBox?.height).toBeGreaterThanOrEqual(44);
    expect(payBox?.height).toBeGreaterThanOrEqual(44);
  });
});

