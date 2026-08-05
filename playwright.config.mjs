import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.DES_BASE_URL ??
  "http://dd-des-web.default.svc.cluster.local:8130";

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
