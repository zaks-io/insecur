import { AUTHORIZATION_SCOPES } from "@insecur/access";

import {
  assertSecretNonProtectedWriteAccess,
  writeAuthorizedBlindSecretWrite,
} from "./write-authorized-blind-secret-write.js";
import {
  type WriteNonProtectedSecretInput,
  type WriteNonProtectedSecretResult,
  writeNonProtectedSecret,
} from "./write-non-protected-secret.js";

export interface WriteAuthorizedNonProtectedSecretInput extends WriteNonProtectedSecretInput {
  effectiveAccess?: import("@insecur/access").EffectiveAccessResult;
  accessCoordinate?: import("@insecur/access").ResourceCoordinate;
}

/**
 * Authorized non-protected Blind Secret Write. Requires pre-resolved Effective Access evidence
 * with `secret:non_protected_write` at the write coordinate before validation or persistence.
 */
export async function writeAuthorizedNonProtectedSecret(
  input: WriteAuthorizedNonProtectedSecretInput,
): Promise<WriteNonProtectedSecretResult> {
  return writeAuthorizedBlindSecretWrite(input, {
    requiredScope: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    denialMessage: "secret non-protected write scope required",
    assertAccess: assertSecretNonProtectedWriteAccess,
    write: writeNonProtectedSecret,
  });
}
