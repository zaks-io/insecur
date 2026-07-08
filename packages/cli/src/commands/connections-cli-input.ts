import { CLI_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";

export function rejectArgvProviderToken(token: string | undefined): void {
  if (token !== undefined) {
    throw new CliError({
      code: CLI_ERROR_CODES.validationError,
      message:
        "Provider tokens must be supplied via --value-stdin or a masked prompt, not --token.",
      retryable: false,
    });
  }
}

export function parseCommaSeparatedRepositories(raw: string): readonly string[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new CliError({
      code: CLI_ERROR_CODES.validationError,
      message: "--allowed-repositories must list at least one repository.",
      retryable: false,
    });
  }
  return parts;
}

export function optionalGitHubBoundaryFields(options: {
  readonly installationId: string | undefined;
  readonly owner: string | undefined;
  readonly allowedRepositories: readonly string[] | undefined;
}): {
  readonly installationId?: string;
  readonly owner?: string;
  readonly allowedRepositories?: readonly string[];
} {
  return {
    ...(options.installationId === undefined ? {} : { installationId: options.installationId }),
    ...(options.owner === undefined ? {} : { owner: options.owner }),
    ...(options.allowedRepositories === undefined
      ? {}
      : { allowedRepositories: options.allowedRepositories }),
  };
}
