// @ts-check

const config = {
  packageManager: "pnpm",
  inPlace: true,
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  mutate: [
    "apps/*/src/**/*.ts",
    "packages/*/src/**/*.ts",
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
    "/.agents/**",
    "/.claude/**",
    "/.codex/**",
    "/.cursor/**",
    "/skills/**",
    "packages/tenant-store/src/db/schema/schema-shape-registry.json",
    "packages/tenant-store/src/db/schema/schema-shape-registry.ts",
    "/coverage/**",
    "/.turbo/**",
    "/.jscpd-report/**",
    "/sbom.cyclonedx.json",
  ],
};

export default config;
