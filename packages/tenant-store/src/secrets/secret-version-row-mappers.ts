import { secretVersionId, type SecretId } from "@insecur/domain";

import { secretVersions } from "../db/schema/tenant-secrets.js";
import { decodeStoredWrappedMaterial } from "../decode-stored-wrapped-material.js";
import { SecretVersionStoreConflictError } from "./errors.js";
import {
  SECRET_VERSION_LIFECYCLE_STATES,
  parseSecretVersionLifecycleState,
  type SecretVersionLifecycleState,
} from "./lifecycle-states.js";
import type {
  AppendSecretVersionAndMakeLiveInput,
  AppendSecretVersionAndMakeLiveResult,
  SecretVersionStoreRow,
} from "./types.js";

export const secretVersionRowSelect = {
  id: secretVersions.id,
  orgId: secretVersions.orgId,
  secretId: secretVersions.secretId,
  versionNumber: secretVersions.versionNumber,
  lifecycleState: secretVersions.lifecycleState,
  organizationDataKeyVersion: secretVersions.organizationDataKeyVersion,
  projectDataKeyVersion: secretVersions.projectDataKeyVersion,
  ciphertextStorageRef: secretVersions.ciphertextStorageRef,
} as const;

export function toSecretVersionStoreRow(
  version: {
    id: string;
    secretId: string;
    versionNumber: number;
    lifecycleState: string;
    organizationDataKeyVersion: number | null;
    projectDataKeyVersion: number | null;
    ciphertextStorageRef: string;
  },
  secretIdValue: SecretId,
): SecretVersionStoreRow {
  return {
    secretVersionId: secretVersionId.brand(version.id),
    secretId: secretIdValue,
    versionNumber: version.versionNumber,
    lifecycleState: parseSecretVersionLifecycleState(version.lifecycleState),
    organizationDataKeyVersion: version.organizationDataKeyVersion ?? 0,
    projectDataKeyVersion: version.projectDataKeyVersion ?? 0,
    wrapped: decodeStoredWrappedMaterial(version, { material: "secret-version" }),
  };
}

export function appendResult(
  input: AppendSecretVersionAndMakeLiveInput,
  versionNumber: number,
  lifecycleState: SecretVersionLifecycleState,
): AppendSecretVersionAndMakeLiveResult {
  return {
    secretId: input.secretId,
    secretVersionId: input.secretVersionId,
    versionNumber,
    lifecycleState,
    createdSecretShape: input.createdSecretShape,
    descriptiveVerdicts: input.descriptiveVerdicts,
  };
}

export function assertDeliverableLifecycleState(lifecycleState: SecretVersionLifecycleState): void {
  if (
    lifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.live &&
    lifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.retained
  ) {
    throw new SecretVersionStoreConflictError("secret version is not deliverable");
  }
}
