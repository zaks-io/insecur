import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      setupFiles: ["test/setup.ts"],
      include: ["test/**/*.test.ts"],
    },
  }),
);
