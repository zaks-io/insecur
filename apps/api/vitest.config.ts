import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

// Default worker test run: co-located unit/route tests only. The DB-backed
// end-to-end loop lives under test/e2e/** and runs via vitest.e2e.config.ts
// (pnpm test:e2e) so it stays out of the fast unit/verify path.
export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "test/canary/console-capture.test.ts"],
    },
  }),
);
