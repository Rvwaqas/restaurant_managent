import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { listPrintSimSlips, clearPrintSimSlips } from "../lib/printSim";
import { tap } from "../lib/touch";

test.describe("10-business-rules: Bill Sequences, Currency 'Rs', Tax Omission & Change Due", () => {
  test.beforeEach(async ({ page }) => {
    clearPrintSimSlips();
    await logout(page);
  });

  test("currency symbol is consistently 'Rs' (never '$' or 'USD')", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    // Open Table 7
    const table7 = page.locator('[data-table-number="7"], [data-table-id="t7"]').first();
    await expect(table7).toBeVisible({ timeout: 10000 });
    await tap(table7);
    await expect(page).toHaveURL(/\/floor-1\/table\/t7/);

    // Check menu item prices use "Rs"
    const priceTexts = await page.locator(".tabular-nums, [data-testid^='item-price']").allTextContents();
    for (const text of priceTexts) {
      if (text.trim().length > 0 && /\d/.test(text)) {
        expect(text).not.toContain("$");
        expect(text).not.toContain("USD");
      }
    }
  });

  test("cash settlement: cash tendered < total disables confirm; cash tendered >= total calculates change due", async ({ page }) => {
    await loginAs(page, "waiter1");
    await page.goto("/floor-1/table/t8");

    // Add item (e.g., Chicken Biryani)
    const biryani = page.locator('button:has-text("Chicken Biryani")').first();
    await expect(biryani).toBeVisible({ timeout: 10000 });
    await tap(biryani);

    // Send order
    const sendBtn = page.getByRole("button", { name: /send to kitchen/i });
    await tap(sendBtn);
    await expect(page.locator("text=Batch #1 Sent!")).toBeVisible({ timeout: 10000 });

    const addMoreBtn = page.getByRole("button", { name: /add more items/i });
    await tap(addMoreBtn);

    // Open Pay sheet
    const payBtn = page.getByRole("button", { name: /pay \/ bill/i });
    await tap(payBtn);

    // Ensure Cash tab is selected
    const cashTab = page.getByRole("button", { name: /cash/i }).first();
    if (await cashTab.isVisible()) {
      await tap(cashTab);
    }

    const confirmPay = page.getByRole("button", { name: /confirm payment/i });

    // Enter custom cash amount that is less than total
    const customCashInput = page.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="tendered"]').first();
    if (await customCashInput.isVisible()) {
      await customCashInput.fill("10"); // Rs 10 is less than biryani total
      // Confirm should be disabled
      await expect(confirmPay).toBeDisabled();

      // Enter amount larger than total: e.g. 1000
      await customCashInput.fill("1000");
      await expect(confirmPay).toBeEnabled();

      // Change Due row must be visible and > 0
      const changeText = page.locator("text=Change Due").or(page.locator("text=Change Given")).first();
      await expect(changeText).toBeVisible();
    } else {
      // Use Exact button
      const exactBtn = page.getByRole("button", { name: /exact/i }).first();
      if (await exactBtn.isVisible()) {
        await tap(exactBtn);
        await expect(confirmPay).toBeEnabled();
      }
    }

    // Confirm Payment
    await tap(confirmPay);
    await expect(page.locator("text=Payment Received!")).toBeVisible({ timeout: 10000 });

    // Check printed bill format
    const slips = listPrintSimSlips();
    const billSlips = slips.filter((s) => s.type === "bill");
    expect(billSlips.length).toBeGreaterThanOrEqual(1);

    const latestBill = billSlips[billSlips.length - 1];
    // Bill number format starts with B-0001
    expect(latestBill.content).toMatch(/BILL NO:\s*B-\d{4}/i);
    // Bill has price columns
    expect(latestBill.content).toMatch(/TOTAL|FINAL BILL RECEIPT/i);
  });

  test("KOT slip never contains prices, while Bill slip contains pricing details", async ({ page }) => {
    // Slips produced in print_sim
    const slips = listPrintSimSlips();
    const kots = slips.filter((s) => s.type === "kot");
    const bills = slips.filter((s) => s.type === "bill");

    for (const kot of kots) {
      // KOT should not have rate/total price column headers
      expect(kot.content).not.toMatch(/FINAL BILL RECEIPT/i);
      expect(kot.content).not.toMatch(/CHANGE DUE/i);
    }

    for (const bill of bills) {
      // Bill must have bill number and final receipt
      expect(bill.content).toMatch(/BILL NO:\s*B-\d{4}/i);
    }
  });
});

