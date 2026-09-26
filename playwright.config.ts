import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isDefaultLocalTarget = baseURL === "http://localhost:3000";
const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  expect: { timeout: 15000 },
  timeout: 60000,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer:
    process.env.E2E_SKIP_WEB_SERVER === "true"
      ? undefined
      : {
          command: isDefaultLocalTarget
            ? "pnpm dev"
            : `pnpm dev --hostname localhost --port ${port}`,
          url: baseURL,
          reuseExistingServer:
            process.env.E2E_REUSE_EXISTING_SERVER === "true" ||
            (isDefaultLocalTarget && !process.env.CI),
        },
});
