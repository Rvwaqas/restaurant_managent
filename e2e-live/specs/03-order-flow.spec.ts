import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { listPrintSimSlips, clearPrintSimSlips } from "../lib/printSim";
import { tap } from "../lib/touch";
import { getAuthToken, cancelAllOpenOrdersApi } from "../lib/api";

test.describe("03-order-flow: Complete Order Lifecycle & Multi-tender Settlement [P]", () => {
  test.beforeEach(async ({ page }) => {
    clearPrintSimSlips();
    try {
      const adminToken = await getAuthToken("admin", "admin123");
      await cancelAllOpenOrdersApi(adminToken);
    } catch {}
    await logout(page);
  });

  test("full ordering flow: multi-category batch, batch 2, CASH pay, slips & bill verification", async ({ page }) => {
    await loginAs(page, "waiter1");
    await page.goto("/floor-1");

    // 1. Table f1-t1 should initially be green (free)
    const tableBtn = page.getByRole("button", { name: "Table 1", exact: true }).first();
    await expect(tableBtn).toBeVisible({ timeout: 10000 });
    await expect(tableBtn).toHaveClass(/bg-\[#DCFCE7\]/); // Green

    // 2. Open table
    await tap(tableBtn);
    await expect(page).toHaveURL(/\/floor-1\/table\/f1-t1/);

    // 3. Add dishes from two different categories (e.g. Sweets and Drinks or items mi1 and mi3)
    const item1 = page.locator("div.group.relative", { hasText: "Gulab Jamun" }).first();
    await expect(item1).toBeVisible();
    await tap(item1); // Add 1

    // Add note to second item via options dialog
    const item2 = page.locator("div.group.relative", { hasText: "Jalebi" }).first();
    await expect(item2).toBeVisible();
    const customizeBtn = item2.locator('button[title*="Customize"], button[aria-label*="Customize"]').first();
    if (await customizeBtn.isVisible()) {
      await tap(customizeBtn);
      const noteInput = page.locator('textarea, input[placeholder*="note" i]').first();
      if (await noteInput.isVisible()) {
        await noteInput.fill("Extra hot and crispy");
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Add to Order"), button:has-text("Save")').first();
        await tap(confirmBtn);
      }
    } else {
      await tap(item2);
    }

    // In portrait mode, the cart is housed in a bottom Drawer that must be opened if not already visible
    const openCartDrawerIfNeeded = async () => {
      const drawerTrigger = page.locator('button[data-testid="bottom-cart-trigger"], button:has-text("Order"), button:has-text("View Order Cart")').first();
      if (await drawerTrigger.isVisible()) {
        const visibleSendOrPay = page.locator('button:has-text("Send to Kitchen"), button:has-text("Pay / Bill")').filter({ has: page.locator(':scope:visible') });
        if (await visibleSendOrPay.count() === 0) {
          await tap(drawerTrigger);
          await page.waitForTimeout(500);
        }
      }
    };

    // 4. Send to Kitchen
    await openCartDrawerIfNeeded();
    const sendBtn = page.locator('button:has-text("Send to Kitchen"):visible').first();
    await expect(sendBtn).toBeEnabled();
    await tap(sendBtn);

    // 5. Send result sheet opens showing print jobs
    const sendSheet = page.locator("h2").filter({ hasText: /Sent!/i }).first();
    await expect(sendSheet).toBeVisible({ timeout: 10000 });

    // Wait for send API call to finish and local cart store to clear
    await page.waitForTimeout(1000);

    // Close result sheet by navigating to floor grid
    const backBtn1 = page.locator('button:has-text("Back to Tables")').first();
    if (await backBtn1.isVisible()) {
      await tap(backBtn1);
    } else {
      await page.goto("/floor-1");
    }

    // 6. Verify Table 1 is now red (occupied) on grid
    await page.goto("/floor-1");
    const occupiedTableBtn = page.getByRole("button", { name: "Table 1", exact: true }).first();
    await expect(occupiedTableBtn).toHaveClass(/bg-\[#FEE2E2\]/); // Red

    // 7. Reopen Table 1 -> already sent items are locked under Already Sent
    await tap(occupiedTableBtn);
    await expect(page).toHaveURL(/\/floor-1\/table\/f1-t1/);
    const alreadySentHeading = page.locator("h3, h4, span, div").filter({ hasText: /Sent to Kitchen|Batch #1/i }).first();
    await expect(alreadySentHeading).toBeVisible({ timeout: 5000 });

    // Clear any residual draft before adding Batch 2 items to ensure clean state
    const clearDraftBtn = page.locator('button:has-text("Clear Draft"), button:has-text("Discard items")').first();
    if (await clearDraftBtn.isVisible()) {
      await tap(clearDraftBtn);
      const confirmDiscard = page.locator('button:has-text("Discard Items")').first();
      if (await confirmDiscard.isVisible()) {
        await tap(confirmDiscard);
      }
    }

    // 8. Add Batch 2 items
    const item3 = page.locator("div.group.relative", { hasText: "Kheer" }).first();
    await tap(item3);

    // Send Batch 2
    await openCartDrawerIfNeeded();
    const sendBtn2 = page.locator('button:has-text("Send to Kitchen"):visible').first();
    await expect(sendBtn2).toBeEnabled();
    await tap(sendBtn2);

    // Wait for send to complete
    await page.waitForTimeout(1000);

    // Close Batch 2 send result sheet
    const backBtn2 = page.locator('button:has-text("Back to Tables"), button:has-text("Add More Items")').first();
    if (await backBtn2.isVisible()) {
      const addMoreBtn = page.locator('button:has-text("Add More Items")').first();
      if (await addMoreBtn.isVisible()) {
        await tap(addMoreBtn);
      } else {
        await tap(backBtn2);
        await page.goto("/floor-1/table/f1-t1");
      }
    } else {
      await page.goto("/floor-1/table/f1-t1");
    }

    // Settle bill with CASH
    await page.goto("/floor-1/table/f1-t1");
    await openCartDrawerIfNeeded();
    const payBtn = page.locator('button:has-text("Pay / Bill"):visible').first();
    await expect(payBtn).toBeEnabled({ timeout: 10000 });
    await tap(payBtn);

    // Payment sheet is open
    const paymentSheetTitle = page.locator("text=Pay Table 1").first();
    await expect(paymentSheetTitle).toBeVisible();

    // Select Cash (default) and verify Confirm button behavior with cash input
    const confirmBtn = page.locator('button:has-text("Confirm Payment")').first();
    await expect(confirmBtn).toBeEnabled(); // Exact quick amount is preselected

    // Test entering insufficient cash
    const cashInput = page.locator('input[type="number"], input[placeholder*="cash" i]').first();
    if (await cashInput.isVisible()) {
      await cashInput.fill("1");
      await expect(confirmBtn).toBeDisabled(); // Insufficient

      // Fill ample cash (e.g. 5000)
      await cashInput.fill("5000");
      await expect(confirmBtn).toBeEnabled();
    }

    // Confirm Payment
    await tap(confirmBtn);

    // Wait for payment confirmation sheet
    const paymentSuccess = page.locator("h2, p, span").filter({ hasText: /Payment Received/i }).first();
    await expect(paymentSuccess).toBeVisible({ timeout: 10000 });

    // 10. Table 1 on floor grid is now green (free)
    await page.goto("/floor-1");
    const freeTableBtn = page.getByRole("button", { name: "Table 1", exact: true }).first();
    await expect(freeTableBtn).toHaveClass(/bg-\[#DCFCE7\]/); // Green

    // 11. Verify slips produced in print_sim
    const slips = listPrintSimSlips();
    expect(slips.length).toBeGreaterThan(0);

    const slipTexts = slips.map((s) => s.text).join("\n---\n");
    expect(slipTexts).toMatch(/TABLE/i);
    expect(slipTexts).toContain("Rs");
    expect(slipTexts).not.toContain("Tax: Rs");
    expect(slipTexts).not.toContain("Service Charge: Rs");
  });

  test("settle order with CARD on table 2", async ({ page }) => {
    await loginAs(page, "waiter1");
    await page.goto("/floor-1/table/f1-t2");

    const openCartDrawerIfNeeded = async () => {
      const drawerTrigger = page.locator('button[data-testid="bottom-cart-trigger"], button:has-text("Order"), button:has-text("View Order Cart")').first();
      if (await drawerTrigger.isVisible()) {
        const visibleSendOrPay = page.locator('button:has-text("Send to Kitchen"), button:has-text("Pay / Bill")').filter({ has: page.locator(':scope:visible') });
        if (await visibleSendOrPay.count() === 0) {
          await tap(drawerTrigger);
          await page.waitForTimeout(500);
        }
      }
    };

    // Add item and send
    const item = page.locator("div.group.relative").first();
    await tap(item);
    await openCartDrawerIfNeeded();
    await tap(page.locator('button:has-text("Send to Kitchen"):visible').first());
    
    // Close send result sheet if open
    const backBtn = page.locator('button:has-text("Back to Tables"), button:has-text("Add More Items")').first();
    await backBtn.waitFor({ state: "visible", timeout: 10000 });
    await tap(backBtn);

    // Pay with CARD
    await page.goto("/floor-1/table/f1-t2");
    await openCartDrawerIfNeeded();
    await tap(page.locator('button:has-text("Pay / Bill"):visible').first());

    // Switch to Card
    const cardMethodBtn = page.locator('button:has-text("Card"), button:has-text("Credit")').first();
    if (await cardMethodBtn.isVisible()) {
      await tap(cardMethodBtn);
    }

    const confirmBtn = page.locator('button:has-text("Confirm Payment")').first();
    await expect(confirmBtn).toBeEnabled();
    await tap(confirmBtn);

    await expect(page.locator("h2, p, span").filter({ hasText: /Payment Received/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("settle order with ONLINE on table 3", async ({ page }) => {
    await loginAs(page, "waiter1");
    await page.goto("/floor-1/table/f1-t3");

    const openCartDrawerIfNeeded = async () => {
      const drawerTrigger = page.locator('button[data-testid="bottom-cart-trigger"], button:has-text("Order"), button:has-text("View Order Cart")').first();
      if (await drawerTrigger.isVisible()) {
        const visibleSendOrPay = page.locator('button:has-text("Send to Kitchen"), button:has-text("Pay / Bill")').filter({ has: page.locator(':scope:visible') });
        if (await visibleSendOrPay.count() === 0) {
          await tap(drawerTrigger);
          await page.waitForTimeout(500);
        }
      }
    };

    // Add item and send
    const item = page.locator("div.group.relative").first();
    await tap(item);
    await openCartDrawerIfNeeded();
    await tap(page.locator('button:has-text("Send to Kitchen"):visible').first());

    // Close send result sheet if open
    const backBtn = page.locator('button:has-text("Back to Tables"), button:has-text("Add More Items")').first();
    await backBtn.waitFor({ state: "visible", timeout: 10000 });
    await tap(backBtn);

    // Pay with ONLINE
    await page.goto("/floor-1/table/f1-t3");
    await openCartDrawerIfNeeded();
    await tap(page.locator('button:has-text("Pay / Bill"):visible').first());

    // Switch to Online
    const onlineMethodBtn = page.locator('button:has-text("Online"), button:has-text("UPI")').first();
    if (await onlineMethodBtn.isVisible()) {
      await tap(onlineMethodBtn);
    }

    const confirmBtn = page.locator('button:has-text("Confirm Payment")').first();
    await expect(confirmBtn).toBeEnabled();
    await tap(confirmBtn);

    await expect(page.locator("h2, p, span").filter({ hasText: /Payment Received/i }).first()).toBeVisible({ timeout: 10000 });
  });
});
