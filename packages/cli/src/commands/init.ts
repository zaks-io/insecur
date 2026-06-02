import { parseDisplayName, successEnvelope, type DisplayName } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { loadProjectConfig } from "../config/project-config.js";
import { resolveCliScope } from "../config/resolve-scope.js";
import { loadUserConfig } from "../config/user-config.js";
import { persistInitConfig } from "./init-persist.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { buildInitResolvedTargets } from "./init-result.js";

function displayNameOrThrow(label: string, raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`${label} display name is invalid: ${raw}`);
  }
  return parsed.value;
}

const INIT_LABELS = {
  organization: displayNameOrThrow("organization", "My workspace"),
  project: displayNameOrThrow("project", "First project"),
  environment: displayNameOrThrow("environment", "Development"),
  profile: displayNameOrThrow("profile", "Local development"),
};

export interface InitCommandOptions {
  readonly profileSlug: string;
}

export async function runInitCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  commandOptions: InitCommandOptions,
): Promise<number> {
  const credential = requireSessionCredential();
  const scope = resolveCliScope(
    flags,
    await loadProjectConfig(flags.configDir),
    await loadUserConfig(),
  );
  const provisioned = await api.provisionPersonalOrganization({
    host: scope.host,
    bearerCredential: credential,
    ...(scope.orgId === undefined ? {} : { organizationId: scope.orgId }),
    ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
    ...(scope.envId === undefined ? {} : { environmentId: scope.envId }),
  });
  if (!provisioned.ok) {
    throw new CliError(provisioned.envelope.error);
  }
  const data = provisioned.envelope.data;
  const { configPath, profileId } = await persistInitConfig({
    configDir: flags.configDir,
    host: scope.host,
    profileSlug: commandOptions.profileSlug,
    profileDisplayName: INIT_LABELS.profile,
    data,
  });
  renderInitSuccess(flags, {
    configPath,
    data,
    profileId,
    profileSlug: commandOptions.profileSlug,
    requestId: provisioned.envelope.meta?.requestId,
  });
  return 0;
}

function renderInitSuccess(
  flags: GlobalCliFlags,
  input: {
    readonly configPath: string;
    readonly data: Parameters<typeof buildInitResolvedTargets>[0];
    readonly profileId: Parameters<typeof buildInitResolvedTargets>[1];
    readonly profileSlug: string;
    readonly requestId: Parameters<typeof buildEnvelopeMeta>[0]["requestId"];
  },
): void {
  const output = successEnvelope(
    {
      configPath: input.configPath,
      organizationId: input.data.organizationId,
      projectId: input.data.projectId,
      environmentId: input.data.developmentEnvironmentId,
      profileId: input.profileId,
      profileSlug: input.profileSlug,
    },
    buildEnvelopeMeta({
      requestId: input.requestId,
      resolvedTargets: buildInitResolvedTargets(
        input.data,
        input.profileId,
        input.profileSlug,
        INIT_LABELS,
      ),
    }),
  );
  renderSuccess(
    output,
    flags,
    () =>
      `Wrote ${input.configPath} with organization, project, environment, and profile defaults.`,
  );
}

export const DEFAULT_INIT_PROFILE_SLUG = "local-dev";
