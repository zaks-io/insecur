import { VALIDATION_ERROR_CODES, type InjectionGrantId } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import { CliError } from "../output/cli-error.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

export interface RunCommandOptions {
  readonly profileSelector?: string;
  readonly policyIdOverride?: string;
  readonly variableKey?: string;
  readonly command: readonly string[];
  readonly watch?: boolean;
  readonly plan?: boolean;
}

export function requireRunCommand(command: readonly string[]): readonly string[] {
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

export async function recordRunCompletedBestEffort(input: {
  readonly api: ApiClient;
  readonly host: string;
  readonly credential: string;
  readonly organizationId: ResolvedSecretWriteScope["orgId"];
  readonly grantId: InjectionGrantId;
  readonly childExitCode: number;
}): Promise<void> {
  try {
    await input.api.recordInjectionRunCompleted({
      host: input.host,
      bearerCredential: input.credential,
      organizationId: input.organizationId,
      grantId: input.grantId,
      childExitCode: input.childExitCode,
    });
  } catch {
    // Best-effort telemetry: transport failures must not fail the injected child exit code.
  }
}
