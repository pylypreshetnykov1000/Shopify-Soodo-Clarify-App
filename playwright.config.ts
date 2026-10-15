import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser", workers: 1, fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3101", browserName: "chromium", screenshot: "only-on-failure" },
  webServer: { command: "npm run dev:local", env: { PORT: "3101", FRONTEND_PORT: "3102" }, url: "http://127.0.0.1:3101/app", reuseExistingServer: false, timeout: 120_000 },
});
