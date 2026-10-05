import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5186",
    viewport: { width: 1280, height: 850 },
    channel: "chrome",
    screenshot: "only-on-failure",
  },
});
