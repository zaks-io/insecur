import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const artifactRoot = fileURLToPath(new URL("../../preview-smoke-artifacts", import.meta.url));
const testDir = fileURLToPath(new URL("tests", import.meta.url));

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  failOnFlakyTests: true,
  forbidOnly: true,
  globalTimeout: 10 * 60_000,
  outputDir: `${artifactRoot}/test-results`,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [
    ["github"],
    ["html", { open: "never", outputFolder: `${artifactRoot}/playwright-report` }],
    ["json", { outputFile: `${artifactRoot}/results.json` }],
    ["junit", { outputFile: `${artifactRoot}/junit.xml` }],
  ],
  retries: 0,
  testDir,
  timeout: 120_000,
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: 1,
});
