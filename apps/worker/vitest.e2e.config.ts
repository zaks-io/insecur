import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

// End-to-end First Value loop: real Worker routes against real Postgres + crypto.
// load-env.ts hydrates DATABASE_URL* from the repo .env.local; the suite self-gates
// via integrationDatabaseReady and skips cleanly when no runtime DB is configured.
export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      setupFiles: ["../../packages/tenant-store/test/rls/load-env.ts"],
      include: ["test/e2e/**/*.test.ts"],
      fileParallelism: false,
      hookTimeout: 60_000,
      testTimeout: 30_000,
    },
  }),
);
