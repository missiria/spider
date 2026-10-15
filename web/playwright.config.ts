import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a running web (3010) + API (8012, GSC_MOCK=1). `PW_BIN` can point at a
 * headless-shell binary on machines where `npx playwright install` is unavailable
 * (macOS 13: ~/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_BIN ? { executablePath: process.env.PW_BIN } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
});
