import { Locator } from "@playwright/test";

/**
 * Tablet-friendly tap helper.
 * Attempts locator.tap() for touch contexts, falling back to locator.click().
 */
export async function tap(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await locator.tap({ timeout: 5000 });
  } catch {
    try {
      await locator.click({ timeout: 5000 });
    } catch {
      await locator.click({ force: true, timeout: 5000 });
    }
  }
}

