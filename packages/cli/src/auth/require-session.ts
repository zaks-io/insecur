import { AUTH_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";
import { resolveSessionCredential } from "../session/memory-session.js";

export function requireSessionCredential(): string {
  const credential = resolveSessionCredential();
  if (credential === undefined) {
    throw new CliError(
      {
        code: AUTH_ERROR_CODES.required,
        message: "Authentication is required. Run insecur login first.",
        retryable: false,
      },
      EXIT_AUTH_REQUIRED,
    );
  }
  return credential;
}
