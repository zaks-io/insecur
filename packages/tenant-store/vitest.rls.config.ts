import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/rls/load-env.ts"],
    include: ["test/rls/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
