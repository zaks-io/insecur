import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";
import { loadRepoEnvLocal } from "../../packages/tenant-store/scripts/lib/env-local.mjs";
import { runtimeComposeAlias } from "./test/support/runtime-compose-alias.js";

loadRepoEnvLocal();

// No-plaintext canary gate: real Worker routes, migration-role Postgres sweep, console capture.
// console-capture.test.ts runs in the worker unit suite (vitest.config.ts) — keep it out of this
// DB-backed gate so coverage and runtime are not duplicated.
export default mergeConfig(
  rootConfig,
  defineConfig({
    resolve: { alias: runtimeComposeAlias },
    test: {
      setupFiles: ["../../packages/tenant-store/test/rls/load-env.ts"],
      include: ["test/canary/**/*.test.ts"],
      exclude: ["test/canary/console-capture.test.ts"],
      fileParallelism: false,
      hookTimeout: 120_000,
      testTimeout: 120_000,
    },
  }),
);
