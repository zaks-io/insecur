import {
  decryptSensitiveMetadataForAuthorizedRead,
  type Keyring,
  type PlaintextHandle,
} from "@insecur/crypto";
import type { SensitiveMetadataCiphertextIdentity } from "@insecur/crypto";
import type { WrappedSensitiveMetadata } from "@insecur/custody-contracts";

/** Allowlisted sensitive-metadata decrypt for GitHub connection validation only (ADR-0071). */
export async function decryptGithubConnectionBoundaryForValidation(
  keyring: Keyring,
  identity: SensitiveMetadataCiphertextIdentity,
  wrapped: WrappedSensitiveMetadata,
): Promise<PlaintextHandle> {
  return decryptSensitiveMetadataForAuthorizedRead(keyring, identity, wrapped);
}
