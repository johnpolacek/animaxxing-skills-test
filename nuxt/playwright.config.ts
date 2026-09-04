import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = path.resolve(__dirname, "..");
/** scripts/eval.sh points this at nuxt/app-eval to test an agent's work. */
const APP_DIR = path.resolve(ROOT, process.env.APP_DIR ?? "nuxt/app");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3103",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build served by the Nitro output: the lifecycle depends on
    // SSR, the built head script, and real chunk URLs, none of which behave the
    // same under `nuxt dev`.
    command: "pnpm build && pnpm preview",
    cwd: APP_DIR,
    url: "http://127.0.0.1:3103",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
