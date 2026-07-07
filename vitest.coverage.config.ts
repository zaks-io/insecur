import { join } from "node:path";

import { configDefaults, defineConfig } from "vitest/config";
import { markdownTextPlugin } from "./packages/cli/test/markdown-text-plugin.js";

const root = process.cwd();

export default defineConfig({
  root,
  plugins: [markdownTextPlugin()],
  test: {
    environment: "node",
    include: ["{src,test}/**/*.test.ts"],
    exclude: [
      ...configDefaults.exclude,
      "**/dist/**",
      "**/coverage/**",
      "**/*.integration.test.ts",
      "**/test/rls/**",
      "**/test/e2e/**",
      "**/test/canary/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["json", "lcov", "text-summary"],
      reportsDirectory: join(root, "coverage"),
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/test/**",
        "**/dist/**",
        "**/index.ts",
        "**/*.d.ts",
      ],
    },
  },
});
