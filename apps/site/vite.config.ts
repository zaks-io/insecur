import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  defineTanStackWorkerConfig,
  repoRootFromAppConfig,
  uiWorkspaceAliases,
} from "../../config/vite/tanstack-worker";

const repoRoot = repoRootFromAppConfig(import.meta.url);

export default defineTanStackWorkerConfig({
  alias: uiWorkspaceAliases(repoRoot),
  plugins: {
    cloudflare,
    react,
    tailwindcss,
    tanstackStart,
    tsconfigPaths,
  },
});
