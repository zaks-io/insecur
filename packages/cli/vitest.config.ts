import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";
import { markdownTextPlugin } from "./test/markdown-text-plugin.js";

export default mergeConfig(
  rootConfig,
  defineConfig({
    plugins: [markdownTextPlugin()],
    test: {
      setupFiles: ["test/setup.ts"],
      include: ["test/*.test.ts"],
    },
  }),
);
