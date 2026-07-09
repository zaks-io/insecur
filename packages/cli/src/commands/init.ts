import {
  AUTH_ERROR_CODES,
  parseDisplayName,
  successEnvelope,
  type DisplayName,
} from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { parseCliProfileSlug } from "../config/profiles/profile-slug.js";
import { resolveAvailableProfileSlug } from "../config/profiles/available-profile-slug.js";
import { isLocalModeHost, LOCAL_MODE_HOST } from "../config/local-mode.js";
import { tryResolveSessionCredential } from "../auth/try-session.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { persistInitConfig } from "./init-persist.js";
import { runLocalInitCommand } from "./init-local.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { CliError } from "../output/cli-error.js";
import { LOGIN_REMEDIATION } from "../output/cli-remediation.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";
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
  readonly profileSlugWasExplicit?: boolean;
}

function requestedHostedInit(flags: GlobalCliFlags): boolean {
  return flags.host !== undefined && !isLocalModeHost(flags.host);
}

export async function runInitCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: InitCommandOptions,
): Promise<number> {
  const session = await tryResolveSessionCredential(context.scope.host);
  if (session === undefined) {
    if (requestedHostedInit(flags)) {
      throw new CliError(
        {
          code: AUTH_ERROR_CODES.required,
          message: "Authentication is required. Run insecur login first.",
          retryable: false,
        },
        { exitCode: EXIT_AUTH_REQUIRED, remediation: LOGIN_REMEDIATION },
      );
    }
    return runLocalInitCommand(flags, commandOptions);
  }

  if (isLocalModeHost(flags.host ?? LOCAL_MODE_HOST) && flags.host !== undefined) {
    return runLocalInitCommand(flags, commandOptions);
  }
  if (flags.host === undefined && isLocalModeHost(context.scope.host)) {
    return runLocalInitCommand(flags, commandOptions);
  }

  return runHostedInitCommand({
    flags,
    api,
    context,
    commandOptions,
    session,
  });
}

async function runHostedInitCommand(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly commandOptions: InitCommandOptions;
  readonly session?: string;
}): Promise<number> {
  const { flags, api, context, commandOptions, session } = input;
  const { host, orgId, projectId, envId } = context.scope;
  const credential = session ?? (await requireSessionCredential(host));
  const profileSlug = await resolveAvailableProfileSlug(
    parseCliProfileSlug(commandOptions.profileSlug, "--profile-slug"),
    { strict: commandOptions.profileSlugWasExplicit === true },
  );
  const provisioned = await api.provisionPersonalOrganization({
    host,
    bearerCredential: credential,
    ...(orgId === undefined ? {} : { organizationId: orgId }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(envId === undefined ? {} : { environmentId: envId }),
  });
  if (!provisioned.ok) {
    throw cliErrorFromEnvelope(provisioned.envelope);
  }
  const data = provisioned.envelope.data;
  const { configPath, profileId } = await persistInitConfig({
    configDir: flags.configDir,
    host,
    profileSlug,
    profileDisplayName: INIT_LABELS.profile,
    data,
  });
  renderInitSuccess(flags, {
    configPath,
    data,
    profileId,
    profileSlug,
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
