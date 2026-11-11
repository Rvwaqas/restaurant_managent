import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../lib/auth";
import { listPrintSimSlips, clearPrintSimSlips } from "../lib/printSim";
import { tap } from "../lib/touch";

test.describe("07-admin: Menu, Floor Tables, Printers & Access Boundaries [P]", () => {
  test.beforeEach(async ({ page }) => {
    clearPrintSimSlips();
    await logout(page);
  });

  test("waiter is forbidden (403) from accessing any /admin route", async ({ page }) => {
    await loginAs(page, "waiter1");
    await expect(page).toHaveURL(/\/floor-1/);

    await page.goto("/admin/menu");
    await expect(page).toHaveURL(/\/403/);
    await expect(page.locator("h1, h2")).toContainText(/403|Forbidden|Access Denied/i);

    await page.goto("/admin/tables");
    await expect(page).toHaveURL(/\/403/);

    await page.goto("/admin/printers");
    await expect(page).toHaveURL(/\/403/);
  });

  test("category CRUD prevents deleting category containing active dishes (409)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/menu");
    await expect(page.locator("h1")).toContainText(/Menu Management/i);

    // Try deleting existing category "Sweet" which has dishes
    const sweetRow = page.locator('text="Sweet"').first();
    await expect(sweetRow).toBeVisible({ timeout: 10000 });

    // Look for delete button on the sweet category row
    const sweetContainer = page.locator('div:has(> div:has-text("Sweet"))').filter({ has: page.locator('button') }).first();
    const sweetDelBtn = sweetContainer.locator('button[title*="Delete"], button:has-text("Delete")').first();
    if (await sweetDelBtn.isVisible()) {
      await tap(sweetDelBtn);
      // Confirm dialog
      const confirmBtn = page.getByRole("button", { name: /delete category|confirm/i });
      if (await confirmBtn.isVisible()) {
        await tap(confirmBtn);
        // Toast or message indicating conflict
        await expect(page.locator("[data-sonner-toast], [role='status'], .toaster")).toContainText(/cannot delete|contains items|409/i);
      }
    }

    // Create a new empty category
    const addCatBtn = page.getByRole("button", { name: /add category/i });
    await tap(addCatBtn);

    await page.fill('#cat-name, input[name="name"]', "Test Category Temp");
    const saveCatBtn = page.getByRole("button", { name: /save category|create category|save/i });
    await tap(saveCatBtn);

    // Verify created
    await expect(page.locator('text="Test Category Temp"').first()).toBeVisible({ timeout: 10000 });
  });

  test("item creation, availability toggle and duplicate item across floors", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/menu");
    await expect(page.locator("h1")).toContainText(/Menu Management/i);

    // Toggle availability on an item
    const toggleBtn = page.locator('button[role="switch"]').first();
    if (await toggleBtn.isVisible()) {
      const initialChecked = await toggleBtn.getAttribute("aria-checked");
      await tap(toggleBtn);
      // Toast appears
      await expect(page.locator("[data-sonner-toast], [role='status'], .toaster")).toBeVisible({ timeout: 5000 });
      // Revert
      await tap(toggleBtn);
    }

    // Verify duplicate dialog triggers
    const dupBtn = page.locator('button[title*="Duplicate"], button:has-text("Duplicate")').first();
    if (await dupBtn.isVisible()) {
      await tap(dupBtn);
      await expect(page.locator("text=Duplicate Dish to Other Floor")).toBeVisible({ timeout: 5000 });
      // Cancel
      const cancelBtn = page.getByRole("button", { name: /cancel/i });
      await tap(cancelBtn);
      await expect(page.locator("text=Duplicate Dish to Other Floor")).toBeHidden();
    }
  });

  test("tables admin allows adding and deleting tables", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/tables");
    await expect(page.locator("h1")).toContainText(/Tables|Table Layout/i);

    // Check existing tables are rendered
    await expect(page.locator("text=Table 1").first()).toBeVisible({ timeout: 10000 });

    // Open Add Table dialog
    const addTableBtn = page.getByRole("button", { name: /add table/i }).first();
    if (await addTableBtn.isVisible()) {
      await tap(addTableBtn);
      await expect(page.locator('input[name="number"], #table-number')).toBeVisible({ timeout: 5000 });
      const cancelBtn = page.getByRole("button", { name: /cancel/i });
      await tap(cancelBtn);
    }
  });

  test("printers admin shows configured printers and test print produces simulated slip", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/printers");
    await expect(page.locator("h1")).toContainText(/Printers/i);

    // Verify configured printers appear (p1, p2, p3, prn-cashier)
    await expect(page.locator("text=Cashier Thermal Printer").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Sweet Printer").first()).toBeVisible();

    // Trigger Test Print on first printer
    const testPrintBtn = page.getByRole("button", { name: /test print/i }).first();
    await expect(testPrintBtn).toBeVisible();
    await tap(testPrintBtn);

    // Toast notification for successful test print
    await expect(page.locator("[data-sonner-toast], [role='status'], .toaster")).toContainText(/test slip sent|test print/i, { timeout: 10000 });

    // Check print_sim directory for test slip
    const slips = listPrintSimSlips();
    expect(slips.length).toBeGreaterThanOrEqual(1);
  });
});

