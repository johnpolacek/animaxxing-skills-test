import { defineConfig, devices } from "@playwright/test";

// Fixtures are static files; globalSetup extracts and bundles the recipes first.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", viewport: { width: 1000, height: 700 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1000, height: 700 } } }],
});
