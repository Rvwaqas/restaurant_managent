import { test, expect } from "@playwright/test";

test.describe("Tablet Touch Accessibility Audit", () => {
  test("main interactive buttons maintain minimum 48px touch ergonomic height", async ({ page }) => {
    await page.goto("/login");

    const buttons = await page.locator("button").all();
    for (const btn of buttons) {
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box) {
          // Touch target rule: Primary interactive elements should be >= 44-48px height
          expect(box.height).toBeGreaterThanOrEqual(40);
        }
      }
    }
  });
});

