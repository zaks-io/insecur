import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The Public Site's workspace dependencies are the presentational @insecur/ui package and
// capability-free @insecur/observability (ADR-0078). Alias the UI entry points to source so the SSR
// bundle builds straight from the monorepo. Exact-match `find` regexes keep `@insecur/ui` from
// swallowing `@insecur/ui/styles.css`.
const workspaceAliases = [
  {
    find: /^@insecur\/ui\/styles\.css$/,
    replacement: path.join(repoRoot, "packages/ui/src/styles/globals.css"),
  },
  {
    find: /^@insecur\/ui$/,
    replacement: path.join(repoRoot, "packages/ui/src/index.ts"),
  },
];

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
  resolve: {
    alias: workspaceAliases,
  },
  ssr: {
    noExternal: [/^@insecur\//],
  },
});
