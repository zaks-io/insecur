import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type AliasOptions, type PluginOption } from "vite";

type CloudflarePlugin = (options: { viteEnvironment: { name: "ssr" } }) => PluginOption;
type PluginFactory = () => PluginOption;

interface TanStackWorkerConfigOptions {
  readonly alias: AliasOptions;
  readonly plugins: {
    readonly cloudflare: CloudflarePlugin;
    readonly react: PluginFactory;
    readonly tailwindcss: PluginFactory;
    readonly tanstackStart: PluginFactory;
    readonly tsconfigPaths: PluginFactory;
  };
  readonly ssrNoExternal?: (RegExp | string)[];
}

export function repoRootFromAppConfig(importMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "../..");
}

export function workspaceSourceAlias(repoRoot: string, specifier: string, sourcePath: string) {
  return {
    find: new RegExp(`^${escapeRegExp(specifier)}$`),
    replacement: path.join(repoRoot, sourcePath),
  };
}

export function uiWorkspaceAliases(repoRoot: string) {
  return [
    workspaceSourceAlias(repoRoot, "@insecur/ui/styles.css", "packages/ui/src/styles/globals.css"),
    workspaceSourceAlias(repoRoot, "@insecur/ui", "packages/ui/src/index.ts"),
  ];
}

export function defineTanStackWorkerConfig({
  alias,
  plugins,
  ssrNoExternal = [/^@insecur\//],
}: TanStackWorkerConfigOptions) {
  return defineConfig({
    plugins: [
      plugins.cloudflare({ viteEnvironment: { name: "ssr" } }),
      plugins.tsconfigPaths(),
      plugins.tailwindcss(),
      plugins.tanstackStart(),
      plugins.react(),
    ],
    resolve: {
      alias,
    },
    ssr: {
      noExternal: ssrNoExternal,
    },
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
