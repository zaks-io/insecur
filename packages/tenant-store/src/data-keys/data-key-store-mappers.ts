import { organizationId, projectId } from "@insecur/domain";

import { organizationDataKeys, projectDataKeys } from "../db/schema/tenant-hierarchy.js";
import type { DataKeyVersionStatus } from "./types.js";

function parseStatus(raw: string): DataKeyVersionStatus {
  if (raw === "active" || raw === "retired" || raw === "revoked") {
    return raw;
  }
  throw new Error("invalid data key status in store");
}

export function toOrganizationMetadata(row: {
  id: string;
  org_id: string;
  key_version: number;
  status: string;
  root_key_version: number;
  wrapped_storage_ref: string | null;
  custody_evidence_ref: string | null;
}) {
  return {
    id: row.id,
    organizationId: organizationId.brand(row.org_id),
    keyVersion: row.key_version,
    status: parseStatus(row.status),
    rootKeyVersion: row.root_key_version,
    wrappedStorageRef: row.wrapped_storage_ref,
    custodyEvidenceRef: row.custody_evidence_ref,
  };
}

export function toProjectMetadata(row: {
  id: string;
  org_id: string;
  project_id: string;
  key_version: number;
  status: string;
  organization_data_key_version: number;
  wrapped_storage_ref: string | null;
}) {
  return {
    id: row.id,
    organizationId: organizationId.brand(row.org_id),
    projectId: projectId.brand(row.project_id),
    keyVersion: row.key_version,
    status: parseStatus(row.status),
    organizationDataKeyVersion: row.organization_data_key_version,
    wrappedStorageRef: row.wrapped_storage_ref,
  };
}

export const organizationDataKeySelect = {
  id: organizationDataKeys.id,
  org_id: organizationDataKeys.orgId,
  key_version: organizationDataKeys.keyVersion,
  status: organizationDataKeys.status,
  root_key_version: organizationDataKeys.rootKeyVersion,
  wrapped_storage_ref: organizationDataKeys.wrappedStorageRef,
  custody_evidence_ref: organizationDataKeys.custodyEvidenceRef,
  created_at: organizationDataKeys.createdAt,
  updated_at: organizationDataKeys.updatedAt,
} as const;

export const projectDataKeySelect = {
  id: projectDataKeys.id,
  org_id: projectDataKeys.orgId,
  project_id: projectDataKeys.projectId,
  key_version: projectDataKeys.keyVersion,
  status: projectDataKeys.status,
  organization_data_key_version: projectDataKeys.organizationDataKeyVersion,
  wrapped_storage_ref: projectDataKeys.wrappedStorageRef,
  created_at: projectDataKeys.createdAt,
  updated_at: projectDataKeys.updatedAt,
} as const;
