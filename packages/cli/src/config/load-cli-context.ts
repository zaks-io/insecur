import type { GlobalCliFlags } from "../cli-options.js";
import { loadProjectConfig } from "./project-config.js";
import type { InsecurProjectConfig } from "./project-config.js";
import { resolveCliScope, type ResolvedCliScope } from "./resolve-scope.js";
import { loadUserConfig } from "./user-config.js";
import type { CliUserConfig } from "./user-config.js";

export interface ResolvedCliContext {
  readonly projectConfig: InsecurProjectConfig | null;
  readonly userConfig: CliUserConfig;
  readonly scope: ResolvedCliScope;
}

export async function loadAndResolveCliContext(flags: GlobalCliFlags): Promise<ResolvedCliContext> {
  const [projectConfig, userConfig] = await Promise.all([
    loadProjectConfig(flags.configDir),
    loadUserConfig(),
  ]);
  const scope = resolveCliScope(flags, projectConfig, userConfig);
  return { projectConfig, userConfig, scope };
}
