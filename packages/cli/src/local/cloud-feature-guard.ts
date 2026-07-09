import { LOCAL_ERROR_CODES, type ErrorRemediation } from "@insecur/domain";
import { isLocalModeHost } from "../config/local-mode.js";
import type { ResolvedCliScope } from "../config/resolve-scope.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_FORBIDDEN } from "../output/exit-codes.js";

interface HostedCapabilityInput {
  readonly capability: string;
  readonly hostedCommand: readonly string[];
  /** Local-Mode command that covers the same need, when one exists. */
  readonly localAlternative?: {
    readonly suggestedFix: string;
    readonly usage: readonly string[];
  };
}

function buildLocalCloudFeatureRemediation(input: HostedCapabilityInput): ErrorRemediation {
  return {
    ...(input.localAlternative === undefined
      ? {}
      : {
          suggestedFix: input.localAlternative.suggestedFix,
          usage: [...input.localAlternative.usage],
        }),
    login: ["insecur", "login"],
    migrate: ["insecur", "projects", "migrate", "--confirm-migrate"],
    hosted: [...input.hostedCommand],
  };
}

export function assertHostedCapability(
  scope: ResolvedCliScope,
  input: HostedCapabilityInput,
): void {
  if (!isLocalModeHost(scope.host)) {
    return;
  }
  const localHint =
    input.localAlternative === undefined ? "" : ` ${input.localAlternative.suggestedFix}`;
  throw new CliError(
    {
      code: LOCAL_ERROR_CODES.cloudFeatureUnavailable,
      message: `${input.capability} is not available in Local Mode.${localHint} For hosted features run insecur login and migrate this project.`,
      retryable: false,
    },
    {
      exitCode: EXIT_FORBIDDEN,
      remediation: buildLocalCloudFeatureRemediation(input),
    },
  );
}
