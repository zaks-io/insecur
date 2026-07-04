import {
  decryptProviderCredentialForProviderUse,
  type Keyring,
  type PlaintextHandle,
} from "@insecur/crypto";
import type { ProviderCredentialCiphertextIdentity } from "@insecur/crypto";
import type { WrappedProviderCredential } from "@insecur/custody-contracts";

/** Allowlisted provider-credential decrypt for Cloudflare connection validation only (ADR-0071). */
export async function decryptProviderCredentialForCloudflareValidation(
  keyring: Keyring,
  identity: ProviderCredentialCiphertextIdentity,
  wrapped: WrappedProviderCredential,
): Promise<PlaintextHandle> {
  return decryptProviderCredentialForProviderUse(keyring, identity, wrapped);
}
