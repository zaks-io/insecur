import {
  encryptSecretValue,
  toStoreFacingCiphertext,
  type Keyring,
  type SecretCiphertextIdentity,
} from "@insecur/crypto";

import type { LocalStoredWrappedSecretMaterial } from "../contracts/types.js";

/** Encrypt a Sensitive Value for local storage using the standard envelope machinery. */
export async function encryptLocalSecretValue(
  keyring: Keyring,
  identity: SecretCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<LocalStoredWrappedSecretMaterial> {
  const wrapped = await encryptSecretValue(keyring, identity, plaintextUtf8);
  return {
    organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: wrapped.projectDataKeyVersion,
    ciphertext: toStoreFacingCiphertext(wrapped),
  };
}
