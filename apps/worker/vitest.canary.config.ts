import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";
import { loadRepoEnvLocal } from "../../packages/tenant-store/scripts/lib/env-local.mjs";

loadRepoEnvLocal();

// No-plaintext canary gate: real Worker routes, migration-role Postgres sweep, console capture.
export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      setupFiles: ["../../packages/tenant-store/test/rls/load-env.ts"],
      include: ["test/canary/**/*.test.ts"],
      fileParallelism: false,
      hookTimeout: 120_000,
      testTimeout: 120_000,
    },
  }),
);
