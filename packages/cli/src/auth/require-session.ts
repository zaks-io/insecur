import { AUTH_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";
import { resolveSessionCredential } from "../session/resolve-session.js";

export interface RequireSessionCredentialOptions {
  readonly host: string;
}

export function requireSessionCredential(options: RequireSessionCredentialOptions): string {
  void options.host;
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
