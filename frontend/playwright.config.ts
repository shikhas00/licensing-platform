/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Run tests sequentially to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid parallel DB access issues
  reporter: "html",
  timeout: 60000, // 60 second default timeout
  expect: {
    timeout: 10000, // 10 second expect timeout
  },
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15000, // 15 second action timeout
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "bash -c 'cd .. && source .venv/bin/activate && cd backend && uvicorn app.main:app --port 8000'",
      url: "http://localhost:8000/docs",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
