import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["junit", { outputFile: "../../reports/e2e-junit.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Skip auto-starting the servers if they're already running locally.
  // In CI, the workflow is expected to launch the API + web before invoking.
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : [
        {
          command: "pnpm --filter @cliff-notes/api run dev",
          url: "http://localhost:3001/api/health",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          cwd: "../..",
        },
        {
          command: "pnpm --filter @cliff-notes/web run dev",
          url: "http://localhost:5173",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          cwd: "../..",
        },
      ],
});
