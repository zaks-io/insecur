import { LOCAL_ERROR_CODES, type ErrorRemediation } from "@insecur/domain";
import { isLocalModeHost } from "../config/local-mode.js";
import type { ResolvedCliScope } from "../config/resolve-scope.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_FORBIDDEN } from "../output/exit-codes.js";

function buildLocalCloudFeatureRemediation(hostedCommand: readonly string[]): ErrorRemediation {
  return {
    login: ["insecur", "login"],
    migrate: ["insecur", "projects", "migrate", "--confirm-migrate"],
    hosted: [...hostedCommand],
  };
}

export function assertHostedCapability(
  scope: ResolvedCliScope,
  input: {
    readonly capability: string;
    readonly hostedCommand: readonly string[];
  },
): void {
  if (!isLocalModeHost(scope.host)) {
    return;
  }
  throw new CliError(
    {
      code: LOCAL_ERROR_CODES.cloudFeatureUnavailable,
      message: `${input.capability} is not available in Local Mode. Run insecur login, migrate this project, then retry the hosted command.`,
      retryable: false,
    },
    {
      exitCode: EXIT_FORBIDDEN,
      remediation: buildLocalCloudFeatureRemediation(input.hostedCommand),
    },
  );
}
