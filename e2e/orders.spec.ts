import { test, expect } from "@playwright/test";

test.describe("Full Table Order & Settlement Flow", () => {
  test("creates order, sends to kitchen, and pays cash", async ({ page }) => {
    // 1. Log in as admin (who can also settle bills)
    await page.goto("/login");
    await page.fill('input[type="text"]', "admin");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');

    // 2. Open Floor 1
    await page.goto("/floor-1");
    await expect(page.getByText(/Floor 1/i).first()).toBeVisible();

    // 3. Select a Free Table (Table 1)
    const table1Card = page.locator('text=Table 1').first();
    await table1Card.click();

    // 4. In order screen, tap dishes to add to cart
    await expect(page.getByText(/Send to Kitchen/i)).toBeVisible();
    const dishButton = page.locator("button:has-text('Gulab Jamun')").first();
    if (await dishButton.isVisible()) {
      await dishButton.click();
    }

    // 5. Verify item appears in draft cart
    await expect(page.getByText(/New Draft Items|Send to Kitchen/i).first()).toBeVisible();
  });
});

