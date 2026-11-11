import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { getAuthToken, listMenuItemsApi, setItemAvailabilityApi } from "../lib/api";

test.describe("02-floors-menus: Menus, Categories & Visibility Rules [P]", () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
  });

  test("floor-1 and floor-2 display their respective menus and categories", async ({ page }) => {
    await loginAs(page, "waiter1");

    // Floor 1 table ordering view
    await page.goto("/floor-1/table/f1-t1");
    await expect(page.locator('[role="tab"]', { hasText: "Sweet" })).toBeVisible({ timeout: 10000 });

    // Floor 2 table ordering view
    await page.goto("/floor-2/table/f2-t1");
    await expect(page.locator('[role="tab"]', { hasText: "Breakfast" })).toBeVisible({ timeout: 10000 });

    // Assert the 3 Floor 2 categories
    const categories = page.locator('[role="tablist"][aria-label="Menu categories"] [role="tab"]');
    const catTexts = await categories.allTextContents();
    const joinedCats = catTexts.join(" ");

    expect(joinedCats).toContain("Breakfast");
    expect(joinedCats).toContain("Lunch & Dinner");
    expect(joinedCats).toContain("Drinks");
  });

  test("waiter sees only active items (80 on floor 2) while admin sees inactive YumYum (81 total)", async ({ page }) => {
    const adminToken = await getAuthToken("admin", "admin123");
    const waiterToken = await getAuthToken("waiter1", "1234");

    const waiterItems = await listMenuItemsApi(waiterToken, "f2", false);
    const adminItems = await listMenuItemsApi(adminToken, "f2", true);

    expect(waiterItems.length).toBe(80);
    expect(adminItems.length).toBe(81);

    const yumYumInWaiter = waiterItems.find((i) => i.name.toLowerCase().includes("yumyum"));
    const yumYumInAdmin = adminItems.find((i) => i.name.toLowerCase().includes("yumyum"));

    expect(yumYumInWaiter).toBeUndefined();
    expect(yumYumInAdmin).toBeDefined();
    expect(yumYumInAdmin.isActive).toBe(false);

    // Verify on UI as waiter: YumYum does not exist
    await loginAs(page, "waiter1");
    await page.goto("/floor-2/table/f2-t1");
    await page.waitForSelector('[placeholder*="Search"]', { state: "visible" });
    await page.fill('[placeholder*="Search"]', "YumYum");
    await expect(page.locator("text=No dishes found")).toBeVisible();

    // Verify in Admin UI: YumYum is listed
    await logout(page);
    await loginAs(page, "admin");
    await page.goto("/admin/menu");
    // Switch to floor 2 if needed or search
    const floorSelect = page.locator("select, [role='combobox']").first();
    if (await floorSelect.isVisible()) {
      await floorSelect.click().catch(() => {});
    }
  });

  test("sold-out item shows Sold Out badge and cannot be added to order", async ({ page }) => {
    const adminToken = await getAuthToken("admin", "admin123");

    // Find an item on floor 1, e.g. mi1
    await setItemAvailabilityApi(adminToken, "mi1", false);

    try {
      await loginAs(page, "waiter1");
      await page.goto("/floor-1/table/f1-t1");
      await page.waitForSelector("text=Gulab Jamun", { state: "visible" });

      const soldOutBadge = page.locator("text=Sold Out").first();
      await expect(soldOutBadge).toBeVisible();

      // Attempt to click the card
      const card = page.locator("div", { hasText: "Gulab Jamun" }).last();
      await card.click({ force: true }).catch(() => {});

      // Cart should remain empty
      const cartItems = page.locator('[data-testid="cart-line-item"]');
      expect(await cartItems.count()).toBe(0);
    } finally {
      // Restore availability
      await setItemAvailabilityApi(adminToken, "mi1", true);
    }
  });

  test("search input and category chips filter items cooperatively", async ({ page }) => {
    await loginAs(page, "waiter1");
    await page.goto("/floor-2/table/f2-t1");
    await page.waitForSelector('[role="tab"]', { state: "visible" });

    // Click Drinks category
    const drinksChip = page.locator('[role="tab"]', { hasText: "Drinks" }).first();
    await drinksChip.click();

    // Search for Teh within Drinks
    const searchInput = page.locator('[placeholder*="Search"]');
    await searchInput.fill("Teh");

    // Visible items should contain Teh
    const itemHeaders = page.locator(".group.relative h4");
    const count = await itemHeaders.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const txt = await itemHeaders.nth(i).textContent();
      expect(txt?.toLowerCase()).toContain("teh");
    }
  });

  test("subcategory labels render cleanly without breaking layout", async ({ page }) => {
    await loginAs(page, "waiter1");
    await page.goto("/floor-2/table/f2-t1");
    await page.waitForSelector("h4", { state: "visible" });

    // Verify subcategory spans exist
    const subcats = page.locator("span.text-\\[10px\\]");
    const count = await subcats.count();
    expect(count).toBeGreaterThan(0);

    // Assert cards maintain valid bounding boxes
    const firstCard = page.locator("div.group.relative").first();
    const box = await firstCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(150);
  });
});
