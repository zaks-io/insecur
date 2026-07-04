import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  defineTanStackWorkerConfig,
  repoRootFromAppConfig,
  uiWorkspaceAliases,
  workspaceSourceAlias,
} from "../../config/vite/tanstack-worker";

const repoRoot = repoRootFromAppConfig(import.meta.url);

const workspaceAliases = [
  ...uiWorkspaceAliases(repoRoot),
  workspaceSourceAlias(repoRoot, "@insecur/auth", "packages/auth/src/index.ts"),
  workspaceSourceAlias(repoRoot, "@insecur/auth/testing", "packages/auth/src/testing/index.ts"),
  workspaceSourceAlias(repoRoot, "@insecur/domain", "packages/domain/src/index.ts"),
  workspaceSourceAlias(repoRoot, "@insecur/token-signing", "packages/token-signing/src/index.ts"),
  workspaceSourceAlias(
    repoRoot,
    "@insecur/worker-kit/api-client",
    "packages/worker-kit/src/rpc/api-client.ts",
  ),
];

export default defineTanStackWorkerConfig({
  alias: workspaceAliases,
  plugins: {
    cloudflare,
    react,
    tailwindcss,
    tanstackStart,
    tsconfigPaths,
  },
  ssrNoExternal: [/^@insecur\//, /^@workos-inc\//],
});
