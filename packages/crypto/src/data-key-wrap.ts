import type { OrganizationId, ProjectId } from "@insecur/domain";

import { DATA_KEY_LENGTH, GCM_IV_LENGTH } from "./constants.js";
import { DecryptError } from "./errors.js";
import { serializeAadFields } from "./envelope-aad.js";
import { aesGcmDecrypt, aesGcmEncrypt, concatBytes, randomIv } from "./envelope-crypto.js";
import { toBufferSource } from "./buffer.js";
import type { KeyVersion, RootKeyProvider } from "./keyring.js";
import {
  decodeInlineWrappedDataKeyStorageRef,
  encodeInlineWrappedDataKeyStorageRef,
} from "./wrapped-data-key-storage-ref.js";

const ORGANIZATION_DATA_KEY_AAD_KIND = "insecur:organization-data-key";
const PROJECT_DATA_KEY_AAD_KIND = "insecur:project-data-key";

export interface OrganizationDataKeyWrapIdentity {
  readonly organizationId: OrganizationId;
  readonly keyVersion: KeyVersion;
}

export interface ProjectDataKeyWrapIdentity extends OrganizationDataKeyWrapIdentity {
  readonly projectId: ProjectId;
}

export interface RootRewrapVersions {
  readonly oldRootVersion: KeyVersion;
  readonly newRootVersion: KeyVersion;
}

export function serializeOrganizationDataKeyWrapAad(
  organizationId: OrganizationId,
  keyVersion: KeyVersion,
): Uint8Array {
  return serializeAadFields([ORGANIZATION_DATA_KEY_AAD_KIND, organizationId, String(keyVersion)]);
}

export function serializeProjectDataKeyWrapAad(identity: ProjectDataKeyWrapIdentity): Uint8Array {
  return serializeAadFields([
    PROJECT_DATA_KEY_AAD_KIND,
    identity.organizationId,
    identity.projectId,
    String(identity.keyVersion),
  ]);
}

async function importRootAesKey(rootKeyBytes: Uint8Array): Promise<CryptoKey> {
  if (rootKeyBytes.byteLength !== DATA_KEY_LENGTH) {
    throw new Error("invalid root key length");
  }
  return crypto.subtle.importKey("raw", toBufferSource(rootKeyBytes), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function parseWrappedDataKeyBlob(wrappedBytes: Uint8Array): {
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  if (wrappedBytes.byteLength <= GCM_IV_LENGTH) {
    throw new DecryptError();
  }
  return {
    iv: wrappedBytes.subarray(0, GCM_IV_LENGTH),
    ciphertext: wrappedBytes.subarray(GCM_IV_LENGTH),
  };
}

export function generateRandomDataKeyBytes(): Uint8Array {
  const bytes = new Uint8Array(DATA_KEY_LENGTH);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function wrapOrganizationDataKeyBytes(
  rootKeyBytes: Uint8Array,
  dataKeyBytes: Uint8Array,
  identity: OrganizationDataKeyWrapIdentity,
): Promise<string> {
  const rootKey = await importRootAesKey(rootKeyBytes);
  const iv = randomIv();
  const ciphertext = await aesGcmEncrypt(
    rootKey,
    iv,
    dataKeyBytes,
    serializeOrganizationDataKeyWrapAad(identity.organizationId, identity.keyVersion),
  );
  return encodeInlineWrappedDataKeyStorageRef(concatBytes(iv, ciphertext));
}

export async function wrapProjectDataKeyBytes(
  rootKeyBytes: Uint8Array,
  dataKeyBytes: Uint8Array,
  identity: ProjectDataKeyWrapIdentity,
): Promise<string> {
  const rootKey = await importRootAesKey(rootKeyBytes);
  const iv = randomIv();
  const ciphertext = await aesGcmEncrypt(
    rootKey,
    iv,
    dataKeyBytes,
    serializeProjectDataKeyWrapAad(identity),
  );
  return encodeInlineWrappedDataKeyStorageRef(concatBytes(iv, ciphertext));
}

export async function unwrapOrganizationDataKeyBytes(
  rootKeyBytes: Uint8Array,
  wrappedStorageRef: string,
  identity: OrganizationDataKeyWrapIdentity,
): Promise<Uint8Array> {
  try {
    const rootKey = await importRootAesKey(rootKeyBytes);
    const wrappedBytes = decodeInlineWrappedDataKeyStorageRef(wrappedStorageRef);
    const { iv, ciphertext } = parseWrappedDataKeyBlob(wrappedBytes);
    const dataKeyBytes = await aesGcmDecrypt(
      rootKey,
      iv,
      ciphertext,
      serializeOrganizationDataKeyWrapAad(identity.organizationId, identity.keyVersion),
    );
    if (dataKeyBytes.byteLength !== DATA_KEY_LENGTH) {
      throw new DecryptError();
    }
    return dataKeyBytes;
  } catch (error) {
    if (error instanceof DecryptError) {
      throw error;
    }
    throw new DecryptError();
  }
}

export async function unwrapProjectDataKeyBytes(
  rootKeyBytes: Uint8Array,
  wrappedStorageRef: string,
  identity: ProjectDataKeyWrapIdentity,
): Promise<Uint8Array> {
  try {
    const rootKey = await importRootAesKey(rootKeyBytes);
    const wrappedBytes = decodeInlineWrappedDataKeyStorageRef(wrappedStorageRef);
    const { iv, ciphertext } = parseWrappedDataKeyBlob(wrappedBytes);
    const dataKeyBytes = await aesGcmDecrypt(
      rootKey,
      iv,
      ciphertext,
      serializeProjectDataKeyWrapAad(identity),
    );
    if (dataKeyBytes.byteLength !== DATA_KEY_LENGTH) {
      throw new DecryptError();
    }
    return dataKeyBytes;
  } catch (error) {
    if (error instanceof DecryptError) {
      throw error;
    }
    throw new DecryptError();
  }
}

export interface MintedOrganizationDataKey {
  readonly dataKeyBytes: Uint8Array;
  readonly wrappedStorageRef: string;
}

export interface MintedProjectDataKey {
  readonly dataKeyBytes: Uint8Array;
  readonly wrappedStorageRef: string;
}

export async function mintOrganizationDataKey(
  rootKeyProvider: RootKeyProvider,
  rootKeyVersion: KeyVersion,
  identity: OrganizationDataKeyWrapIdentity,
): Promise<MintedOrganizationDataKey> {
  const rootKeyBytes = await rootKeyProvider.getRootKeyBytes(rootKeyVersion);
  const dataKeyBytes = generateRandomDataKeyBytes();
  const wrappedStorageRef = await wrapOrganizationDataKeyBytes(
    rootKeyBytes,
    dataKeyBytes,
    identity,
  );
  return { dataKeyBytes, wrappedStorageRef };
}

export async function mintProjectDataKey(
  rootKeyProvider: RootKeyProvider,
  rootKeyVersion: KeyVersion,
  identity: ProjectDataKeyWrapIdentity,
): Promise<MintedProjectDataKey> {
  const rootKeyBytes = await rootKeyProvider.getRootKeyBytes(rootKeyVersion);
  const dataKeyBytes = generateRandomDataKeyBytes();
  const wrappedStorageRef = await wrapProjectDataKeyBytes(rootKeyBytes, dataKeyBytes, identity);
  return { dataKeyBytes, wrappedStorageRef };
}

export async function rewrapOrganizationDataKeyStorageRef(
  rootKeyProvider: RootKeyProvider,
  wrappedStorageRef: string,
  identity: OrganizationDataKeyWrapIdentity,
  versions: RootRewrapVersions,
): Promise<string> {
  const oldRootBytes = await rootKeyProvider.getRootKeyBytes(versions.oldRootVersion);
  const dataKeyBytes = await unwrapOrganizationDataKeyBytes(
    oldRootBytes,
    wrappedStorageRef,
    identity,
  );
  const newRootBytes = await rootKeyProvider.getRootKeyBytes(versions.newRootVersion);
  return wrapOrganizationDataKeyBytes(newRootBytes, dataKeyBytes, identity);
}

export async function rewrapProjectDataKeyStorageRef(
  rootKeyProvider: RootKeyProvider,
  wrappedStorageRef: string,
  identity: ProjectDataKeyWrapIdentity,
  versions: RootRewrapVersions,
): Promise<string> {
  const oldRootBytes = await rootKeyProvider.getRootKeyBytes(versions.oldRootVersion);
  const dataKeyBytes = await unwrapProjectDataKeyBytes(oldRootBytes, wrappedStorageRef, identity);
  const newRootBytes = await rootKeyProvider.getRootKeyBytes(versions.newRootVersion);
  return wrapProjectDataKeyBytes(newRootBytes, dataKeyBytes, identity);
}
