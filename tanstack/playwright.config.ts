import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = path.resolve(__dirname, "..");
/** scripts/eval.sh points this at tanstack/app-eval to test an agent's work. */
const APP_DIR = path.resolve(ROOT, process.env.APP_DIR ?? "tanstack/app");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3105",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build served by the Start server: the lifecycle depends on
    // SSR, hydration timing, and the built client bundle, none of which behave
    // the same under `vite dev`.
    command: "pnpm build && pnpm start",
    cwd: APP_DIR,
    url: "http://localhost:3105",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
