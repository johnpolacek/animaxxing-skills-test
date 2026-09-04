import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = path.resolve(__dirname, "..");
/** scripts/eval.sh points this at sveltekit/app-eval to test an agent's work. */
const APP_DIR = path.resolve(ROOT, process.env.APP_DIR ?? "sveltekit/app");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3102",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build served by adapter-node: hydration, chunk names, and
    // the pre-paint script all behave differently under `vite dev`.
    command: "pnpm build && pnpm preview",
    cwd: APP_DIR,
    url: "http://127.0.0.1:3102",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
