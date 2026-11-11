import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "iPad Landscape",
      use: {
        viewport: { width: 1024, height: 768 },
        userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        hasTouch: true,
      },
    },
    {
      name: "iPad Portrait",
      use: {
        viewport: { width: 768, height: 1024 },
        userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        hasTouch: true,
      },
    },
    {
      name: "Tablet 1280x800",
      use: {
        viewport: { width: 1280, height: 800 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run start",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60000,
  },
});

