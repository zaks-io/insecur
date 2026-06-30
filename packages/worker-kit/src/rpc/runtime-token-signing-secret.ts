export class RuntimeTokenSigningSecretConfigError extends Error {
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
