import { defineConfig, mergeConfig } from "vitest/config";

import rootConfig from "./vitest.config.js";
import { markdownTextPlugin } from "./packages/cli/test/markdown-text-plugin.js";

const testExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.integration.test.ts",
  "**/test/rls/**",
  "**/test/e2e/**",
  "**/test/canary/**",
];

const projectRoots = [
  "packages/access",
  "packages/audit",
  "packages/auth",
  "packages/backup-restore",
  "packages/cli",
  "packages/crypto",
  "packages/domain",
  "packages/instance-bootstrap",
  "packages/machine-auth",
  "packages/app-connection",
  "packages/onboarding",
  "packages/operations",
  "packages/release-gate",
  "packages/runtime-injection",
  "packages/secret-store",
  "packages/tenant-store",
  "packages/token-signing",
  "packages/worker-kit",
  "apps/api",
  "apps/runtime",
];

export default mergeConfig(
  rootConfig,
  defineConfig({
    plugins: [markdownTextPlugin()],
    test: {
      fileParallelism: false,
      projects: projectRoots.map((root) => ({
        extends: "./vitest.config.ts",
        ...(root === "packages/cli" ? { plugins: [markdownTextPlugin()] } : {}),
        test: {
          root,
          name: root,
          include: ["{src,test}/**/*.test.ts"],
          exclude: testExclude,
          ...(root === "packages/cli" ? { setupFiles: ["test/setup.ts"] } : {}),
        },
      })),
    },
  }),
);
