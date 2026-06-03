import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/test/**",
        "**/dist/**",
        "**/index.ts",
        "**/*.d.ts",
      ],
      // Ratchet floor: set just under current so CI is green today and any
      // regression trips it. Raise these as coverage climbs; never lower.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 82,
        branches: 62,
      },
    },
  },
});
