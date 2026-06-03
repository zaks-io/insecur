import { defineConfig } from "vitest/config";
import { loadRepoEnvLocal } from "./scripts/lib/env-local.mjs";

loadRepoEnvLocal();

export default defineConfig({
  test: {
    setupFiles: ["test/rls/load-env.ts"],
    include: ["test/rls/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    passWithNoTests: false,
  },
});
