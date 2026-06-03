import { defineConfig, mergeConfig } from "vitest/config";

import rootConfig from "./vitest.config.js";

// Single-run workspace coverage scoped to what CI can run: unit tests only.
// Integration suites (*.integration.test.ts) and RLS suites need a live
// Postgres and run via `pnpm test:integration` / `pnpm test:rls`. They are
// excluded here so the report reflects exactly the DB-less suite CI executes.
const testExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.integration.test.ts",
  "**/test/rls/**",
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
