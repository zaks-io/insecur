import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type UserConfig } from "vitest/config";
import { loadRepoEnvLocal } from "../../scripts/lib/env-local.mjs";

const tenantStoreRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

loadRepoEnvLocal();

type TestConfig = NonNullable<UserConfig["test"]>;

/**
 * Vitest config for consumer package tests that need the tenant-store test DB env loader.
 * Pass `import.meta.url` and the repo root vitest config from the consumer package.
 */
function defineConsumerVitestConfig(
  configModuleUrl: string,
  rootConfig: UserConfig,
  testConfig: TestConfig,
) {
  return mergeConfig(
    rootConfig,
    defineConfig({
      test: {
        setupFiles: [join(tenantStoreRoot, "test/rls/load-env.ts")],
        fileParallelism: false,
        hookTimeout: 60_000,
        testTimeout: 30_000,
        ...testConfig,
      },
    }),
  );
}

/** Vitest config for package integration tests that run through forced-RLS Postgres. */
export function defineConsumerRlsVitestConfig(configModuleUrl: string, rootConfig: UserConfig) {
  const packageRoot = dirname(fileURLToPath(configModuleUrl));

  return defineConsumerVitestConfig(configModuleUrl, rootConfig, {
    include: [join(packageRoot, "test/**/*.integration.test.ts")],
    passWithNoTests: false,
  });
}

/** Vitest config for package unit tests; DB-backed integration suites run via test:rls. */
export function defineConsumerUnitVitestConfig(configModuleUrl: string, rootConfig: UserConfig) {
  const packageRoot = dirname(fileURLToPath(configModuleUrl));

  return defineConsumerVitestConfig(configModuleUrl, rootConfig, {
    include: [join(packageRoot, "test/**/*.test.ts")],
    exclude: [join(packageRoot, "test/**/*.integration.test.ts")],
  });
}
