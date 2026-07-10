import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseEnvironmentId, parseRuntimePolicyId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireProjectScope } from "./navigation-scope.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { finishApiCommand } from "./finish-api-command.js";

export interface RunPoliciesDisableCommandOptions {
  readonly policyId: string;
  readonly envId: string;
  readonly comment: string;
  readonly operationId: string | undefined;
}

function disableResumeArgv(
  options: RunPoliciesDisableCommandOptions,
  operationId: string,
): readonly string[] {
  return [
    "insecur",
    "run-policies",
    "disable",
    options.policyId,
    "--env-id",
    options.envId,
    "--comment",
    options.comment,
    "--operation",
    operationId,
    "--json",
  ];
}

export async function runRunPoliciesDisableCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunPoliciesDisableCommandOptions,
): Promise<number> {
  if (commandOptions.comment.trim().length === 0) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "--comment is required.",
      retryable: false,
    });
  }

  const credential = await requireSessionCredential(context.scope.host);
  const projectScope = requireProjectScope(context.scope);
  const environmentId = parseEnvironmentId(commandOptions.envId, "--env-id");
  const policyId = parseRuntimePolicyId(commandOptions.policyId, "--policy-id");
  const operationId =
    commandOptions.operationId === undefined
      ? undefined
      : parseOperationIdOrThrow(commandOptions.operationId);

  const result = await api.disableRuntimeInjectionPolicy({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: projectScope.orgId,
    projectId: projectScope.projectId,
    environmentId,
    policyId,
    comment: commandOptions.comment,
    ...(operationId === undefined ? {} : { operationId }),
  });
  if (!result.ok) {
    return finishApiCommand(result, flags, () => "", {
      resumeArgv: (nextOperationId) => disableResumeArgv(commandOptions, nextOperationId),
    });
  }

  const data = result.envelope.data;
  renderSuccess(
    result.envelope,
    flags,
    () => `Disabled runtime injection policy ${data.policyId}.`,
  );
  return 0;
}
