import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config.
 *
 * Assumes both servers are already running:
 *   API  -> http://localhost:5057  (ASPNETCORE_ENVIRONMENT=Development)
 *   Web  -> http://localhost:3000  (`npx serve -s build -l 3000`, or `npm start`)
 *
 * Test accounts are created by e2e/global-setup.ts against the API.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_BASE ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
