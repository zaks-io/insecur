import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@insecur/auth/testing",
        replacement: path.join(repoRoot, "packages/auth/src/testing/index.ts"),
      },
      {
        find: "@insecur/auth",
        replacement: path.join(repoRoot, "packages/auth/src/index.ts"),
      },
      {
        find: "@insecur/domain",
        replacement: path.join(repoRoot, "packages/domain/src/index.ts"),
      },
      {
        find: "@insecur/worker-kit/record-admission-denied-audit",
        replacement: path.join(
          repoRoot,
          "packages/worker-kit/src/auth/record-admission-denied-audit.ts",
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
