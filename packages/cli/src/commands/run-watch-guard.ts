import type { EnvironmentId } from "@insecur/domain";
import { ENVIRONMENT_LIFECYCLE_STAGES, VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { InsecurProjectConfig } from "../config/project-config.js";
import { CliError } from "../output/cli-error.js";

/**
 * `--watch` is development-only: the target environment must be the project's
 * provisioned development environment (`defaultEnvId` in `.insecur.json`).
 */
export function assertRunWatchDevelopmentEnvironment(input: {
  readonly envId: EnvironmentId;
  readonly projectConfig: InsecurProjectConfig | null;
}): void {
  if (input.projectConfig === null) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message:
        "insecur run --watch requires a project .insecur.json that records the development environment.",
      retryable: false,
    });
  }
  if (input.envId !== input.projectConfig.defaultEnvId) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: `insecur run --watch is available only for the ${ENVIRONMENT_LIFECYCLE_STAGES.development} environment (${input.projectConfig.defaultEnvId}).`,
      retryable: false,
    });
  }
}
