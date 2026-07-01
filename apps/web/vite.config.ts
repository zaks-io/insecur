import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const workspaceAliases = {
  "@insecur/auth": path.join(repoRoot, "packages/auth/src/index.ts"),
  "@insecur/auth/testing": path.join(repoRoot, "packages/auth/src/testing/index.ts"),
  "@insecur/domain": path.join(repoRoot, "packages/domain/src/index.ts"),
  "@insecur/token-signing": path.join(repoRoot, "packages/token-signing/src/index.ts"),
  "@insecur/worker-kit/api-client": path.join(
    repoRoot,
    "packages/worker-kit/src/rpc/api-client.ts",
  ),
  "@insecur/worker-kit/record-admission-denied-audit": path.join(
    repoRoot,
    "packages/worker-kit/src/auth/record-admission-denied-audit.ts",
  ),
};

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths(),
    tanstackStart(),
    react(),
  ],
  resolve: {
    alias: workspaceAliases,
  },
  ssr: {
    noExternal: [/^@insecur\//, /^@workos-inc\//],
  },
});
