import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { EnvironmentId } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { parseWritableProjectConfigKey } from "../config/config-keys.js";
import { loadProjectConfig, writeProjectConfig } from "../config/project-config.js";
import { parseEnvironmentId } from "../config/parse-resource-id.js";
import { CliError } from "../output/cli-error.js";

export async function runConfigSetCommand(
  flags: GlobalCliFlags,
  rawKey: string,
  rawValue: string,
): Promise<number> {
  const key = parseWritableProjectConfigKey(rawKey);
  const envId = parseEnvironmentId(rawValue, `config set ${rawKey}`);
  const projectConfig = await loadProjectConfig(flags.configDir);
  if (projectConfig === null) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Project config not found. Run insecur init first.",
      retryable: false,
    });
  }
  const updated =
    key.kind === "default-env-id"
      ? { ...projectConfig, defaultEnvId: envId }
      : applyBranchEnvUpdate(projectConfig, key.branch, envId);
  await writeProjectConfig(flags.configDir, updated);
  return 0;
}

function applyBranchEnvUpdate(
  projectConfig: NonNullable<Awaited<ReturnType<typeof loadProjectConfig>>>,
  branch: string,
  envId: EnvironmentId,
): typeof projectConfig {
  const gitBranchToEnvironment: Record<string, EnvironmentId> = {
    ...(projectConfig.gitBranchToEnvironment ?? {}),
    [branch]: envId,
  };
  return { ...projectConfig, gitBranchToEnvironment };
}
