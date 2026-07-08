import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseEnvironmentId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { readDisplayNameFromStdin } from "../input/read-display-name-stdin.js";
import { requireDisplayNameStdinFlag } from "../input/require-display-name-stdin.js";
import { requireProjectScope } from "./navigation-scope.js";
import { buildCreateEnvironmentOutput } from "./envs-create-result.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";

export interface EnvsCreateCommandOptions {
  readonly envId: string;
  readonly displayNameStdin: boolean;
  readonly copyShapesFromEnvId: string | undefined;
}

export async function runEnvsCreateCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: EnvsCreateCommandOptions,
): Promise<number> {
  requireDisplayNameStdinFlag(commandOptions.displayNameStdin);

  const credential = await requireSessionCredential(context.scope.host);
  const projectScope = requireProjectScope(context.scope);
  const environmentId = parseEnvironmentId(commandOptions.envId, "--env-id");
  const displayName = await readDisplayNameFromStdin("--display-name-stdin");
  const copyShapesFromEnvironmentId =
    commandOptions.copyShapesFromEnvId === undefined
      ? undefined
      : parseEnvironmentId(commandOptions.copyShapesFromEnvId, "--copy-shapes-from-env-id");

  const result = await api.createEnvironment({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: projectScope.orgId,
    projectId: projectScope.projectId,
    environmentId,
    displayName,
    ...(copyShapesFromEnvironmentId === undefined ? {} : { copyShapesFromEnvironmentId }),
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const data = result.envelope.data;
  renderSuccess(
    buildCreateEnvironmentOutput(data, result.envelope.meta?.requestId),
    flags,
    () => `Created environment ${data.environmentId}.`,
  );
  return 0;
}
