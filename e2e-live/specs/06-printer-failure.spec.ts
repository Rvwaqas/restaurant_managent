import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { restartBackend, sleep } from "../lib/stack";
import { getOpenOrderForTableApi } from "../lib/api";
import { tap } from "../lib/touch";

test.describe("06-printer-failure: Kitchen & Cashier Printer Fault Tolerance", () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
  });

  test("failed kitchen printer shows failed chip with retry, while order remains saved in DB", async ({ page }) => {
    // Stack is started with SIMULATE_FAIL_PRINTERS=p2
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    // Open Table 5
    const table5 = page.locator('[data-table-number="5"], [data-table-id="t5"]').first();
    await expect(table5).toBeVisible({ timeout: 10000 });
    await tap(table5);
    await expect(page).toHaveURL(/\/floor-1\/table\/t5/);

    // Select Spicy category (category c2 routes to p2)
    const spicyTab = page.locator('button:has-text("Spicy"), [role="tab"]:has-text("Spicy")').first();
    if (await spicyTab.isVisible()) {
      await tap(spicyTab);
    }

    // Add Chicken Biryani (routes to p2)
    const biryani = page.locator('button:has-text("Chicken Biryani")').first();
    await expect(biryani).toBeVisible({ timeout: 10000 });
    await tap(biryani);

    // Send order
    const sendBtn = page.getByRole("button", { name: /send to kitchen/i });
    await expect(sendBtn).toBeEnabled({ timeout: 5000 });
    await tap(sendBtn);

    // Send Result Sheet appears
    await expect(page.locator("text=Batch #1 Sent!")).toBeVisible({ timeout: 10000 });

    // Verify amber failure indicator and Retry button for Spicy Station / p2
    const retryBtn = page.getByRole("button", { name: /retry/i }).first();
    await expect(retryBtn).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Spicy Station")).toBeVisible();

    // Verify the order IS saved in the backend DB despite printer failure
    const openOrder = await getOpenOrderForTableApi("t5");
    expect(openOrder).not.toBeNull();
    expect(openOrder?.status).toBe("open");
    expect(openOrder?.items?.length).toBeGreaterThanOrEqual(1);

    // Now restart backend with failPrinters cleared
    await restartBackend({ failPrinters: "" });

    // Tap Retry in the dialog
    await tap(retryBtn);

    // Verify retry succeeds and status transitions to "Printed"
    await expect(page.locator("text=Printed").first()).toBeVisible({ timeout: 10000 });
  });

  test("failed cashier printer on settlement preserves payment record and shows retry", async ({ page }) => {
    // Restart backend with prn-cashier failing
    await restartBackend({ failPrinters: "prn-cashier" });

    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    // Open Table 6
    const table6 = page.locator('[data-table-number="6"], [data-table-id="t6"]').first();
    await expect(table6).toBeVisible({ timeout: 10000 });
    await tap(table6);
    await expect(page).toHaveURL(/\/floor-1\/table\/t6/);

    // Add Sweet item (c1 routes to p1, which works)
    const sweetTab = page.locator('button:has-text("Sweet"), [role="tab"]:has-text("Sweet")').first();
    if (await sweetTab.isVisible()) {
      await tap(sweetTab);
    }

    const jamun = page.locator('button:has-text("Gulab Jamun")').first();
    await expect(jamun).toBeVisible({ timeout: 10000 });
    await tap(jamun);

    // Send to kitchen
    const sendBtn = page.getByRole("button", { name: /send to kitchen/i });
    await tap(sendBtn);
    await expect(page.locator("text=Batch #1 Sent!")).toBeVisible({ timeout: 10000 });

    // Close Send Sheet to return to order view
    const addMoreBtn = page.getByRole("button", { name: /add more items/i });
    await tap(addMoreBtn);

    // Click Pay
    const payBtn = page.getByRole("button", { name: /pay \/ bill/i });
    await expect(payBtn).toBeEnabled({ timeout: 5000 });
    await tap(payBtn);

    // In Payment Sheet, select Cash -> Exact -> Confirm Payment
    const cashTab = page.getByRole("button", { name: /cash/i }).first();
    if (await cashTab.isVisible()) {
      await tap(cashTab);
    }

    const exactBtn = page.getByRole("button", { name: /exact/i }).first();
    if (await exactBtn.isVisible()) {
      await tap(exactBtn);
    }

    const confirmPay = page.getByRole("button", { name: /confirm payment/i });
    await expect(confirmPay).toBeEnabled({ timeout: 5000 });
    await tap(confirmPay);

    // Payment Result Sheet appears with "Payment Received!"
    await expect(page.locator("text=Payment Received!")).toBeVisible({ timeout: 10000 });

    // Verify Cashier Printer shows failure with Retry button
    const retryBillBtn = page.getByRole("button", { name: /retry/i }).first();
    await expect(retryBillBtn).toBeVisible({ timeout: 5000 });

    // Navigate Back to Tables: Table 6 must be vacant / green
    const backBtn = page.getByRole("button", { name: /back to tables/i });
    await tap(backBtn);
    await expect(page).toHaveURL(/\/floor-1/);

    // Table 6 should have status green (free)
    const table6Card = page.locator('[data-table-number="6"], [data-table-id="t6"]').first();
    await expect(table6Card).toBeVisible();
    await expect(table6Card).not.toContainText("Occupied");
  });
});

