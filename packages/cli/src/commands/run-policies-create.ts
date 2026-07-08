import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import {
  parseEnvironmentId,
  parseRuntimePolicyId,
  parseSecretIds,
} from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { readDisplayNameFromStdin } from "../input/read-display-name-stdin.js";
import { requireDisplayNameStdinFlag } from "../input/require-display-name-stdin.js";
import { requireProjectScope } from "./navigation-scope.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import { handleApiFailure } from "./api-failure.js";
import { renderSuccess } from "../output/render.js";

export interface RunPoliciesCreateCommandOptions {
  readonly policyId: string;
  readonly envId: string;
  readonly displayNameStdin: boolean;
  readonly command: string;
  readonly commandFingerprint: string | undefined;
  readonly secretIds: string;
  readonly operationId: string | undefined;
}

export async function runRunPoliciesCreateCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunPoliciesCreateCommandOptions,
): Promise<number> {
  requireDisplayNameStdinFlag(commandOptions.displayNameStdin);

  const credential = await requireSessionCredential(context.scope.host);
  const projectScope = requireProjectScope(context.scope);
  const environmentId = parseEnvironmentId(commandOptions.envId, "--env-id");
  const policyId = parseRuntimePolicyId(commandOptions.policyId, "--policy-id");
  const displayName = await readDisplayNameFromStdin("--display-name-stdin");
  const secretIds = parseSecretIds(commandOptions.secretIds, "--secret-ids");
  const operationId =
    commandOptions.operationId === undefined
      ? undefined
      : parseOperationIdOrThrow(commandOptions.operationId);

  const result = await api.createRuntimeInjectionPolicy({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: projectScope.orgId,
    projectId: projectScope.projectId,
    environmentId,
    policyId,
    displayName,
    command: commandOptions.command,
    secretIds,
    ...(commandOptions.commandFingerprint !== undefined
      ? { commandFingerprint: commandOptions.commandFingerprint }
      : {}),
    ...(operationId === undefined ? {} : { operationId }),
  });
  if (!result.ok) {
    return handleApiFailure(result.envelope, flags);
  }

  const data = result.envelope.data;
  renderSuccess(result.envelope, flags, () => `Created runtime injection policy ${data.policyId}.`);
  return 0;
}
