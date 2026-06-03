import { defineConfig, mergeConfig } from "vitest/config";

import rootConfig from "./vitest.config.js";

// Single-run workspace coverage scoped to what CI can run: unit tests only.
// Integration suites (*.integration.test.ts), RLS suites, and the e2e First
// Value loop need a live Postgres and run via `pnpm test:integration` /
// `pnpm test:rls` / `pnpm test:e2e`. They are excluded here so the report
// reflects exactly the DB-less suite CI executes (and so importing the e2e
// suite does not trigger its DB-reachability probe during coverage).
const testExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.integration.test.ts",
  "**/test/rls/**",
  "**/test/e2e/**",
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
  "apps/worker",
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
