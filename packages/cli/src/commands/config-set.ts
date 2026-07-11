import { VALIDATION_ERROR_CODES, successEnvelope } from "@insecur/domain";
import type { EnvironmentId } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { parseWritableProjectConfigKey } from "../config/config-keys.js";
import { loadProjectConfig, writeProjectConfig } from "../config/project-config.js";
import { parseEnvironmentId } from "../config/parse-resource-id.js";
import { setCrashReportsPreference, type CrashReportsPreference } from "../config/user-config.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";

// `value` is a forbidden envelope key (Sensitive Value naming), so the envelope carries
// configKey/configValue.
interface ConfigSetData {
  readonly configKey: string;
  readonly configValue: string;
}

export async function runConfigSetCommand(
  flags: GlobalCliFlags,
  rawKey: string,
  rawValue: string,
): Promise<number> {
  if (rawKey === "crash-reports") {
    const preference = parseCrashReportsPreferenceValue(rawValue);
    await setCrashReportsPreference(preference);
    renderConfigSetSuccess(flags, { configKey: rawKey, configValue: preference });
    return 0;
  }

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
  renderConfigSetSuccess(flags, { configKey: rawKey, configValue: envId });
  return 0;
}

// Every command emits a machine-readable envelope in --json mode; a silent success would hand a
// stdout-parsing agent EOF instead of `{ ok: true }`.
function renderConfigSetSuccess(flags: GlobalCliFlags, data: ConfigSetData): void {
  renderSuccess(successEnvelope(data), flags, formatConfigSetHuman);
}

function formatConfigSetHuman(data: ConfigSetData): string {
  return `Set ${data.configKey} to ${data.configValue}.`;
}

function parseCrashReportsPreferenceValue(rawValue: string): CrashReportsPreference {
  if (rawValue === "on" || rawValue === "off") {
    return rawValue;
  }
  throw new CliError({
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
    message: "Config key crash-reports must be set to on or off.",
    retryable: false,
  });
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
