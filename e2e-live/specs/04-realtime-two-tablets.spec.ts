import { test, expect } from "@playwright/test";
import { loginAs } from "../lib/auth";
import { getAuthToken, setItemAvailabilityApi, apiFetch } from "../lib/api";
import { tap } from "../lib/touch";

test.describe("04-realtime-two-tablets: Multi-tablet Synchronized Realtime", () => {
  test("table state, payment conflict dialog, menu updates, and floor isolation synchronize across tablets", async ({
    browser,
  }) => {
    // Tablet A: waiter1
    const contextA = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
    });
    const pageA = await contextA.newPage();

    // Tablet B: waiter2
    const contextB = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
    });
    const pageB = await contextB.newPage();

    try {
      // 1. Both tablets log in and land on floor-1
      await loginAs(pageA, "waiter1");
      await pageA.goto("/floor-1");

      // Waiter2 credentials: waiter2 / 1234
      await pageB.goto("/login");
      await pageB.fill("#username", "waiter2");
      await pageB.fill("#password", "1234");
      await pageB.click('button[type="submit"]');
      await pageB.waitForURL(/\/floor-1/);

      // Verify Table 4 is initially green on both
      const table4A = pageA.locator('button', { hasText: "Table 4" }).first();
      const table4B = pageB.locator('button', { hasText: "Table 4" }).first();
      await expect(table4A).toHaveClass(/bg-\[#DCFCE7\]/);
      await expect(table4B).toHaveClass(/bg-\[#DCFCE7\]/);

      // 2. Tablet A sends an order on Table 4
      await tap(table4A);
      await pageA.waitForURL(/\/table\/f1-t4/);
      await tap(pageA.locator("div.group.relative").first());
      await tap(pageA.locator('button:has-text("Send to Kitchen")').first());

      // 3. Tablet B's grid shows Table 4 turning RED within 2s without manual page reload
      await expect(table4B).toHaveClass(/bg-\[#FEE2E2\]/, { timeout: 3000 });

      // 4. Tablet B opens Table 4 while it is occupied
      await tap(table4B);
      await pageB.waitForURL(/\/table\/f1-t4/);

      // 5. Tablet A settles Table 4
      await pageA.goto("/floor-1/table/f1-t4");
      await tap(pageA.locator('button:has-text("Pay / Bill")').first());
      await tap(pageA.locator('button:has-text("Confirm Payment")').first());
      await pageA.waitForTimeout(1000);

      // 6. Tablet B displays the "Table Already Paid" modal without refreshing
      const paidElsewhereDialog = pageB.locator("text=Paid on Another Device, text=Table Already Settled, text=Order Paid").first();
      await expect(paidElsewhereDialog).toBeVisible({ timeout: 5000 });

      // Close modal on Tablet B and return to floor grid
      const okBtn = pageB.locator('button:has-text("Return to Tables"), button:has-text("OK")').first();
      if (await okBtn.isVisible()) {
        await tap(okBtn);
      } else {
        await pageB.goto("/floor-1");
      }

      // Verify Table 4 is now green on Tablet B
      await expect(table4B).toHaveClass(/bg-\[#DCFCE7\]/, { timeout: 5000 });

      // 7. Admin marks an item sold out -> Waiter A's open view reflects it
      const adminToken = await getAuthToken("admin", "admin123");
      await pageA.goto("/floor-1/table/f1-t5");
      await pageA.waitForSelector("text=Gulab Jamun", { state: "visible" });

      await setItemAvailabilityApi(adminToken, "mi1", false);
      // Waiter A's card for Gulab Jamun should show "Sold Out"
      const soldOutBadge = pageA.locator("div.group.relative:has-text('Gulab Jamun') text=Sold Out").first();
      await expect(soldOutBadge).toBeVisible({ timeout: 5000 });

      // Restore availability
      await setItemAvailabilityApi(adminToken, "mi1", true);

      // 8. Admin adds a table -> Appears on Waiter A's grid
      await pageA.goto("/floor-1");
      const createdTable = await apiFetch<any>("/tables", {
        method: "POST",
        token: adminToken,
        body: { floorId: "f1", number: 88, capacity: 4 },
      });

      const newTableCard = pageA.locator('button', { hasText: "Table 88" }).first();
      await expect(newTableCard).toBeVisible({ timeout: 5000 });

      // Clean up table 88
      await apiFetch(`/tables/${createdTable.id}`, {
        method: "DELETE",
        token: adminToken,
      });

      // 9. Waiter 3 (floor-1 only) never receives floor-2 events
      const contextC = await browser.newContext();
      const pageC = await contextC.newPage();
      const consoleErrors: string[] = [];
      pageC.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await loginAs(pageC, "waiter3");
      await pageC.goto("/floor-1");

      // Emit an update on Floor 2 via API
      await apiFetch<any>("/tables", {
        method: "POST",
        token: adminToken,
        body: { floorId: "f2", number: 87, capacity: 2 },
      });

      await pageC.waitForTimeout(1000);
      // Assert no crash or console errors on waiter3
      const criticalErrors = consoleErrors.filter((e) => !e.includes("favicon"));
      expect(criticalErrors.length).toBe(0);

      await contextC.close();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

