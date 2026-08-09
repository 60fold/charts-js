import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  projects: [
    {
      name: "chromium",
      grepInvert: /@mobile/,
      use: {
        browserName: "chromium",
        headless: true,
        viewport: { width: 1_100, height: 760 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "firefox",
      grepInvert: /@mobile/,
      use: {
        browserName: "firefox",
        headless: true,
        viewport: { width: 1_100, height: 760 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "webkit",
      grepInvert: /@mobile/,
      // Linux WebKit can intermittently lose a transferred OffscreenCanvas or
      // crash its page process under repeated worker-canvas tests. Keep the
      // cross-engine coverage and retry only this project in CI.
      retries: process.env.CI ? 2 : 0,
      use: {
        browserName: "webkit",
        headless: true,
        viewport: { width: 1_100, height: 760 },
        deviceScaleFactor: 1,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
    {
      name: "mobile-chromium",
      grep: /@mobile/,
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        headless: true,
      },
    },
    {
      name: "mobile-webkit",
      grep: /@mobile/,
      grepInvert: /@pinch/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        headless: true,
      },
    },
    {
      name: "tablet-chromium-pinch",
      grep: /@pinch/,
      use: {
        ...devices["iPad Mini"],
        browserName: "chromium",
        headless: true,
      },
    },
  ],
});
