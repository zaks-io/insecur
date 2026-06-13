import { defineConfig, mergeConfig } from "vitest/config";

import rootConfig from "./vitest.config.js";

// Single-run workspace coverage scoped to what CI can run: unit tests only.
// Integration suites (*.integration.test.ts), RLS suites, the e2e First Value
// loop, and the no-plaintext canary gate need a live Postgres and run via
// `pnpm test:integration` / `pnpm test:rls` / `pnpm test:e2e` /
// `pnpm test:canary`. They are excluded here so the report reflects exactly
// the DB-less suite CI executes (and so importing those suites does not
// trigger their DB-reachability probes during coverage).
const testExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.integration.test.ts",
  "**/test/rls/**",
  "**/test/e2e/**",
  "**/test/canary/**",
];

const projectRoots = [
  "packages/access",
  "packages/audit",
  "packages/auth",
  "packages/cli",
  "packages/crypto",
  "packages/domain",
  "packages/instance-bootstrap",
  "packages/onboarding",
  "packages/operations",
  "packages/runtime-injection",
  "packages/secret-store",
  "packages/tenant-store",
  "packages/worker-kit",
  "apps/api",
  "apps/runtime",
];

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      projects: projectRoots.map((root) => ({
        extends: "./vitest.config.ts",
        test: {
          root,
          name: root,
          include: ["{src,test}/**/*.test.ts"],
          exclude: testExclude,
        },
      })),
    },
  }),
);
