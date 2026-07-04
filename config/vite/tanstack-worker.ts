import path from "node:path";
import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv, type AliasOptions, type PluginOption } from "vite";

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
  return defineConfig(({ mode }) => {
    const sentryPlugin = sentryViteBuildPlugin(mode);

    return {
      ...(sentryPlugin
        ? {
            build: {
              sourcemap: "hidden" as const,
            },
          }
        : {}),
      plugins: [
        plugins.cloudflare({ viteEnvironment: { name: "ssr" } }),
        plugins.tsconfigPaths(),
        plugins.tailwindcss(),
        plugins.tanstackStart(),
        plugins.react(),
        ...(sentryPlugin ?? []),
      ],
      resolve: {
        alias,
      },
      ssr: {
        noExternal: ssrNoExternal,
      },
    };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sentryViteBuildPlugin(mode: string): PluginOption[] | undefined {
  const env = loadEnv(mode, process.cwd(), "");
  const authToken = env.SENTRY_AUTH_TOKEN;
  if (!authToken) {
    return undefined;
  }

  const releaseName = env.SENTRY_RELEASE ?? env.INSECUR_DEPLOY_SHA;
  if (!releaseName) {
    throw new Error(
      "SENTRY_RELEASE or INSECUR_DEPLOY_SHA is required to upload Sentry source maps.",
    );
  }

  return sentryVitePlugin({
    authToken,
    org: env.SENTRY_ORG ?? "zaksio",
    project: env.SENTRY_PROJECT ?? "insecur",
    release: {
      name: releaseName,
    },
    sourcemaps: {
      filesToDeleteAfterUpload: ["./dist/client/**/*.map"],
    },
    telemetry: false,
  });
}
