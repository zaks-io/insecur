import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../../../vitest.config.js";
import { loadRepoEnvLocal } from "../../../../packages/tenant-store/scripts/lib/env-local.mjs";
import { runtimeComposeAlias } from "./runtime-compose-alias.js";

interface DbSuiteOptions {
  include: string[];
  exclude?: string[];
  hookTimeout: number;
  testTimeout: number;
}

// Shared shape for the DB-backed suites (e2e, canary): real Worker routes over the
// runtime compose alias, env hydrated from the repo .env.local via load-env.ts.
export function defineDbSuiteConfig(options: DbSuiteOptions) {
  loadRepoEnvLocal();

  return mergeConfig(
    rootConfig,
    defineConfig({
      resolve: { alias: runtimeComposeAlias },
      test: {
        setupFiles: ["../../packages/tenant-store/test/rls/load-env.ts"],
        fileParallelism: false,
        ...options,
      },
    }),
  );
}
