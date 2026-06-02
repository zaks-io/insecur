import type { WrappedSecretValue } from "@insecur/crypto";
import { toStoreFacingCiphertext } from "@insecur/crypto";
import type { StoredWrappedSecretMaterial } from "@insecur/tenant-store";

/** Maps encryption output to store-facing wrapped material (no identity echo). */
export function toStoredWrappedSecretMaterial(
  wrapped: WrappedSecretValue,
): StoredWrappedSecretMaterial {
  return {
    organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: wrapped.projectDataKeyVersion,
    ciphertext: toStoreFacingCiphertext(wrapped),
  };
}
