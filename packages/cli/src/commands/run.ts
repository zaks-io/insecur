import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";
import {
  base64UrlToBytes,
  INJECTION_ERROR_CODES,
  successEnvelope,
  VALIDATION_ERROR_CODES,
  type VariableKey,
} from "@insecur/domain";
import type {
  ApiClient,
  InjectionGrantDeliveryData,
  IssueInjectionGrantData,
} from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { parseVariableKeyOrThrow } from "./parse-variable-key.js";
import { buildRunResolvedTargets } from "./run-result.js";
import { requireSecretWriteScope, type ResolvedSecretWriteScope } from "./secrets-set-scope.js";

export interface RunCommandOptions {
  readonly variableKey: string;
  readonly command: readonly string[];
}

function requireRunCommand(command: readonly string[]): readonly string[] {
  const [executable] = command;
  if (executable === undefined || executable === "") {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Command is required after --.",
      retryable: false,
    });
  }
  return command;
}

function decodeDeliveryValue(encodedValueUtf8: string): string {
  const bytes = base64UrlToBytes(encodedValueUtf8);
  if (bytes === null) {
    throw new CliError({
      code: INJECTION_ERROR_CODES.decryptFailed,
      message: "Grant delivery payload could not be decoded.",
      retryable: false,
    });
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function buildRunChildEnv(variableKey: VariableKey, valueUtf8: string): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    [variableKey]: valueUtf8,
  };
  delete childEnv.INSECUR_SESSION_TOKEN;
  delete childEnv.INSECUR_DEPLOY_KEY;
  delete childEnv.INSECUR_OIDC_TOKEN;
  return childEnv;
}

function exitCodeForChildClose(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code;
  }
  if (signal === null) {
    return 0;
  }
  const signalNumber = osConstants.signals[signal];
  return 128 + signalNumber;
}

function spawnCommand(command: readonly string[], childEnv: NodeJS.ProcessEnv): Promise<number> {
  const executable = command[0];
  if (executable === undefined) {
    throw new Error("spawnCommand requires a validated command");
  }
  const args = command.slice(1);
  return new Promise<number>((resolve, reject) => {
    const child = spawn(executable, args, { env: childEnv, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve(exitCodeForChildClose(code, signal));
    });
  });
}

async function issueAndConsumeGrant(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly variableKey: VariableKey;
}): Promise<{ issueData: IssueInjectionGrantData; delivery: InjectionGrantDeliveryData }> {
  const issueResult = await input.api.issueInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    projectId: input.runScope.projectId,
    environmentId: input.runScope.envId,
    variableKey: input.variableKey,
  });
  if (!issueResult.ok) {
    throw new CliError(issueResult.envelope.error);
  }

  const consumeResult = await input.api.consumeInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    grantId: issueResult.envelope.data.grantId,
    variableKey: input.variableKey,
  });
  if (!consumeResult.ok) {
    throw new CliError(consumeResult.envelope.error);
  }

  return {
    issueData: issueResult.envelope.data,
    delivery: consumeResult.envelope.delivery,
  };
}

export async function runRunCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential();
  const runScope = requireSecretWriteScope(context.scope);
  const variableKey = parseVariableKeyOrThrow(commandOptions.variableKey);
  const command = requireRunCommand(commandOptions.command);
  const { issueData, delivery } = await issueAndConsumeGrant({
    api,
    credential,
    host: context.scope.host,
    runScope,
    variableKey,
  });

  const childExitCode = await spawnCommand(
    command,
    buildRunChildEnv(variableKey, decodeDeliveryValue(delivery.encodedValueUtf8)),
  );

  renderSuccess(
    successEnvelope(
      {
        grantId: issueData.grantId,
        variableKey: delivery.variableKey,
        secretId: delivery.secretId,
        secretVersionId: delivery.secretVersionId,
        childExitCode,
        ...(delivery.auditEventId !== undefined ? { auditEventId: delivery.auditEventId } : {}),
      },
      buildEnvelopeMeta({
        resolvedTargets: buildRunResolvedTargets(runScope, variableKey, issueData, delivery),
      }),
    ),
    flags,
    (data) =>
      `Injected ${data.variableKey} via grant ${data.grantId}; child exited with code ${String(data.childExitCode)}.`,
  );
  return childExitCode;
}
