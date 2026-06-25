import { decodeInlineCiphertextStorageRef } from "./secrets/ciphertext-storage-ref.js";
import type { StoredWrappedProviderCredential } from "./provider-credentials/types.js";
import type { StoredWrappedSecretMaterial } from "./secrets/types.js";
import type { StoredWrappedSensitiveMetadata } from "./sensitive-metadata/types.js";

interface DecodeStoredWrappedMaterialRow {
  organizationDataKeyVersion: number | null;
  projectDataKeyVersion?: number | null;
  ciphertextStorageRef: string;
}

export type DecodeStoredWrappedMaterialOptions =
  | { readonly material: "secret-version" }
  | { readonly material: "sensitive-metadata" }
  | { readonly material: "provider-credential" };

function decodeSecretVersionWrappedMaterial(row: {
  organizationDataKeyVersion: number | null;
  projectDataKeyVersion: number | null;
  ciphertextStorageRef: string;
}): StoredWrappedSecretMaterial {
  if (row.organizationDataKeyVersion === null || row.projectDataKeyVersion === null) {
    throw new Error("secret version missing data key version metadata");
  }
  return {
    organizationDataKeyVersion: row.organizationDataKeyVersion,
    projectDataKeyVersion: row.projectDataKeyVersion,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertextStorageRef),
  };
}

function decodeSensitiveMetadataWrappedMaterial(row: {
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number | null;
  ciphertextStorageRef: string;
}): StoredWrappedSensitiveMetadata {
  return {
    organizationDataKeyVersion: row.organizationDataKeyVersion,
    projectDataKeyVersion: row.projectDataKeyVersion,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertextStorageRef),
  };
}

function decodeProviderCredentialWrappedMaterial(row: {
  organizationDataKeyVersion: number;
  ciphertextStorageRef: string;
}): StoredWrappedProviderCredential {
  return {
    organizationDataKeyVersion: row.organizationDataKeyVersion,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertextStorageRef),
  };
}

function requireOrganizationDataKeyVersion(
  value: number | null,
  material: "sensitive-metadata" | "provider-credential",
): number {
  if (value === null) {
    throw new Error(`${material} missing organization data key version metadata`);
  }
  return value;
}

export function decodeStoredWrappedMaterial(
  row: DecodeStoredWrappedMaterialRow & {
    organizationDataKeyVersion: number | null;
    projectDataKeyVersion: number | null;
  },
  options: { readonly material: "secret-version" },
): StoredWrappedSecretMaterial;
export function decodeStoredWrappedMaterial(
  row: DecodeStoredWrappedMaterialRow & {
    organizationDataKeyVersion: number;
    projectDataKeyVersion: number | null;
  },
  options: { readonly material: "sensitive-metadata" },
): StoredWrappedSensitiveMetadata;
export function decodeStoredWrappedMaterial(
  row: Pick<
    DecodeStoredWrappedMaterialRow,
    "organizationDataKeyVersion" | "ciphertextStorageRef"
  > & {
    organizationDataKeyVersion: number;
  },
  options: { readonly material: "provider-credential" },
): StoredWrappedProviderCredential;
export function decodeStoredWrappedMaterial(
  row: DecodeStoredWrappedMaterialRow,
  options: DecodeStoredWrappedMaterialOptions,
): StoredWrappedSecretMaterial | StoredWrappedSensitiveMetadata | StoredWrappedProviderCredential {
  switch (options.material) {
    case "secret-version":
      return decodeSecretVersionWrappedMaterial({
        organizationDataKeyVersion: row.organizationDataKeyVersion,
        projectDataKeyVersion: row.projectDataKeyVersion ?? null,
        ciphertextStorageRef: row.ciphertextStorageRef,
      });
    case "sensitive-metadata":
      return decodeSensitiveMetadataWrappedMaterial({
        organizationDataKeyVersion: requireOrganizationDataKeyVersion(
          row.organizationDataKeyVersion,
          "sensitive-metadata",
        ),
        projectDataKeyVersion: row.projectDataKeyVersion ?? null,
        ciphertextStorageRef: row.ciphertextStorageRef,
      });
    case "provider-credential":
      return decodeProviderCredentialWrappedMaterial({
        organizationDataKeyVersion: requireOrganizationDataKeyVersion(
          row.organizationDataKeyVersion,
          "provider-credential",
        ),
        ciphertextStorageRef: row.ciphertextStorageRef,
      });
  }
}
