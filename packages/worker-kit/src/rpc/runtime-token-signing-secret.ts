import { AUTH_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";

export class RuntimeTokenSigningSecretConfigError extends Error {
  readonly code: KnownErrorCode = AUTH_ERROR_CODES.configInvalid;
  readonly retryable = false;

  constructor() {
    super(
      "runtime configuration invalid: runtimeTokenSigningSecret must be a non-empty value of at least 32 characters",
    );
    this.name = "RuntimeTokenSigningSecretConfigError";
  }
}

/**
 * Fail closed before minting or verifying API→Runtime hop tokens (INS-276, ADR-0077).
 * Call sites: `runtimeClientFor` (API mint seam) and `actorFromHopToken` (Runtime verify seam).
 */
export function validateRuntimeTokenSigningSecret(secret: string | undefined): void {
  if (secret === undefined || secret.trim() === "" || secret.length < 32) {
    throw new RuntimeTokenSigningSecretConfigError();
  }
}
