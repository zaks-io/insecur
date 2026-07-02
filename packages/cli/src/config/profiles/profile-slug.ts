import { CLI_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../../output/cli-error.js";

/** Lower-kebab CLI Profile Slug: `local-dev`, `test-integration`, etc. */
const CLI_PROFILE_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isCliProfileSlug(value: string): boolean {
  return CLI_PROFILE_SLUG_PATTERN.test(value);
}

export function parseCliProfileSlug(raw: string, context = "CLI profile slug"): string {
  if (!isCliProfileSlug(raw)) {
    throw new CliError({
      code: CLI_ERROR_CODES.invalidProfileSlug,
      message: `${context} must be lower-kebab (for example: local-dev).`,
      retryable: false,
    });
  }
  return raw;
}
