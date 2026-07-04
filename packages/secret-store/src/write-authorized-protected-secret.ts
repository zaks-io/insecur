import { AUTHORIZATION_SCOPES } from "@insecur/access";

import {
  assertSecretProtectedDraftWriteAccess,
  writeAuthorizedBlindSecretWrite,
} from "./write-authorized-blind-secret-write.js";
import {
  type WriteProtectedSecretInput,
  type WriteProtectedSecretResult,
  writeProtectedSecret,
} from "./write-protected-secret.js";

export interface WriteAuthorizedProtectedSecretInput extends WriteProtectedSecretInput {
  effectiveAccess?: import("@insecur/access").EffectiveAccessResult;
  accessCoordinate?: import("@insecur/access").ResourceCoordinate;
}

/**
 * Authorized protected Blind Secret Write. Requires pre-resolved Effective Access evidence
 * with `secret:protected_draft_write` at the write coordinate before validation or persistence.
 */
export async function writeAuthorizedProtectedSecret(
  input: WriteAuthorizedProtectedSecretInput,
): Promise<WriteProtectedSecretResult> {
  return writeAuthorizedBlindSecretWrite(input, {
    requiredScope: AUTHORIZATION_SCOPES.secretProtectedDraftWrite,
    denialMessage: "secret protected draft write scope required",
    assertAccess: assertSecretProtectedDraftWriteAccess,
    write: writeProtectedSecret,
  });
}
