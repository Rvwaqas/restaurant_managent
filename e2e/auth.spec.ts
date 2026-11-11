import { test, expect } from "@playwright/test";

test.describe("POS Authentication & Role Guards", () => {
  test("shows error toast on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', "invalid_user");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(page.getByText(/Wrong username or password/i)).toBeVisible();
  });

  test("waiter login navigates to allowed floor", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', "waiter1");
    await page.fill('input[type="password"]', "1234");
    await page.click('button[type="submit"]');

    await page.waitForURL("**/floor-1");
    await expect(page.getByText(/Floor 1/i).first()).toBeVisible();
  });

  test("waiter is blocked from accessing admin management", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', "waiter1");
    await page.fill('input[type="password"]', "1234");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/floor-1");

    await page.goto("/admin");
    await page.waitForURL("**/403");
    await expect(page.getByText(/Access Forbidden/i)).toBeVisible();
  });

  test("restricted waiter3 is blocked from floor-2", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', "waiter3");
    await page.fill('input[type="password"]', "1234");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/floor-1");

    await page.goto("/floor-2");
    await page.waitForURL("**/403");
  });
});

