import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type UserConfig } from "vitest/config";
import { loadRepoEnvLocal } from "../../scripts/lib/env-local.mjs";

const tenantStoreRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

loadRepoEnvLocal();

/**
 * Vitest config for package integration tests that run through forced-RLS Postgres.
 * Pass `import.meta.url` and the repo root vitest config from the consumer package.
 */
export function defineConsumerRlsVitestConfig(configModuleUrl: string, rootConfig: UserConfig) {
  const packageRoot = dirname(fileURLToPath(configModuleUrl));

  return mergeConfig(
    rootConfig,
    defineConfig({
      test: {
        setupFiles: [join(tenantStoreRoot, "test/rls/load-env.ts")],
        include: [join(packageRoot, "test/**/*.integration.test.ts")],
        fileParallelism: false,
        hookTimeout: 60_000,
        testTimeout: 30_000,
        passWithNoTests: false,
      },
    }),
  );
}
