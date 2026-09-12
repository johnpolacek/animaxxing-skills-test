import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.VANILLA_TEST_PORT ?? 4173);
const baseURL = `http://localhost:${port}`;

const repoRoot = path.resolve(__dirname, "..");

// scripts/eval.sh points this at vanilla/app-eval to test an agent's own work.
const appDir = path.resolve(repoRoot, process.env.APP_DIR ?? "vanilla/app");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${port} --strictPort`,
    cwd: appDir,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
