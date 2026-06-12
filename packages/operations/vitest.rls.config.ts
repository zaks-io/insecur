import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";
import { loadRepoEnvLocal } from "../tenant-store/scripts/lib/env-local.mjs";

loadRepoEnvLocal();

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      setupFiles: ["../tenant-store/test/rls/load-env.ts"],
      include: ["test/**/*.integration.test.ts"],
      fileParallelism: false,
      hookTimeout: 60_000,
      testTimeout: 30_000,
      passWithNoTests: false,
    },
  }),
);
