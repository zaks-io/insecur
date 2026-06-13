import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

// Runtime Worker unit tests: co-located only. The DB-backed First Value loop that exercises the
// RuntimeService over the in-process binding lives in apps/api's e2e suite (ADR-0065).
export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
    },
  }),
);
