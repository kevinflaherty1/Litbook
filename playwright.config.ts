import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the local Supabase stack (`pnpm db:start`) and read
 * magic-link emails from its Mailpit inbox.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: use a preinstalled Chromium instead of `playwright install`.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
