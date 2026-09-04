import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = path.resolve(__dirname, "..");
/** scripts/eval.sh points this at react-router/app-eval to test an agent's work. */
const APP_DIR = path.resolve(ROOT, process.env.APP_DIR ?? "react-router/app");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3104",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build: the lifecycle depends on the server render, the
    // pre-paint script, and the built asset URLs, none of which match `dev`.
    command: "pnpm build && pnpm start",
    cwd: APP_DIR,
    url: "http://localhost:3104",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
