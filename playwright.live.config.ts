import { defineConfig } from "@playwright/test";
import path from "path";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e-live/specs",
  outputDir: "./e2e-live/results",
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "e2e-live/results/results.json" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    hasTouch: true,
  },
  projects: [
    {
      name: "tablet-landscape",
      use: {
        viewport: { width: 1024, height: 768 },
        userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        hasTouch: true,
      },
    },
    {
      name: "tablet-portrait",
      use: {
        viewport: { width: 768, height: 1024 },
        userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        hasTouch: true,
      },
    },
  ],
});

