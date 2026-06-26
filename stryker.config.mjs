// @ts-check

const config = {
  packageManager: "pnpm",
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  mutate: [
    "apps/*/src/**/*.ts",
    "packages/*/src/**/*.ts",
    "!packages/cli/src/**/*.ts",
    "!**/*.test.ts",
    "!**/*.d.ts",
    "!**/index.ts",
  ],
  vitest: {
    configFile: "vitest.mutation.config.ts",
    related: true,
  },
  reporters: ["progress", "clear-text", "html", "json"],
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  incremental: true,
  incrementalFile: "reports/mutation/stryker-incremental.json",
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
  concurrency: "50%",
  tempDirName: ".stryker-tmp",
  ignorePatterns: [
    "/.claude/**",
    "/.codex/**",
    "/.cursor/**",
    "/skills/**",
    "/coverage/**",
    "/.turbo/**",
    "/.jscpd-report/**",
    "/sbom.cyclonedx.json",
  ],
};

export default config;
