import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      setupFiles: ["../tenant-store/test/rls/load-env.ts"],
      include: ["test/**/*.test.ts"],
      fileParallelism: false,
      hookTimeout: 60_000,
      testTimeout: 30_000,
    },
  }),
);
