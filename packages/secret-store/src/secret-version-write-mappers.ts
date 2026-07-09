import type { AuditActorRef } from "@insecur/audit";
import { toStoreFacingCiphertext, type WrappedSecretValue } from "@insecur/crypto";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { SecretVersionCreatorActor, StoredWrappedSecretMaterial } from "@insecur/tenant-store";

import { SecretWriteError } from "./secret-write-error.js";

export function toStoredWrappedSecretMaterial(
  wrapped: WrappedSecretValue,
): StoredWrappedSecretMaterial {
  return {
    organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: wrapped.projectDataKeyVersion,
    ciphertext: toStoreFacingCiphertext(wrapped),
  };
}

/**
 * Stamps the creating actor on the new Secret Version (ADR-0017 §27 discard authorization source of
 * truth). A successful Blind Secret Write is always a User or Machine Identity; a `ci_exchange`
 * actor is an unauthenticated exchange attempt that never reaches a write, so it fails closed here.
 */
export function toSecretVersionCreatorActor(actor: AuditActorRef): SecretVersionCreatorActor {
  if (actor.type === "user") {
    return { type: "user", userId: actor.userId };
  }
  if (actor.type === "machine") {
    return { type: "machine", machineIdentityId: actor.machineIdentityId };
  }
  throw new SecretWriteError(
    AUTH_ERROR_CODES.insufficientScope,
    "secret write requires a user or machine actor",
  );
}
