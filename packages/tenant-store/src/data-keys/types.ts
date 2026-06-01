import type { OrganizationId, ProjectId } from "@insecur/domain";

export const DATA_KEY_VERSION_STATUSES = ["active", "retired", "revoked"] as const;

export type DataKeyVersionStatus = (typeof DATA_KEY_VERSION_STATUSES)[number];

export interface OrganizationDataKeyRow {
  id: string;
  org_id: string;
  key_version: number;
  status: DataKeyVersionStatus;
  root_key_version: number;
  wrapped_storage_ref: string | null;
  custody_evidence_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectDataKeyRow {
  id: string;
  org_id: string;
  project_id: string;
  key_version: number;
  status: DataKeyVersionStatus;
  organization_data_key_version: number;
  wrapped_storage_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SeedOrganizationDataKeyInput {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly keyVersion: number;
  readonly status?: DataKeyVersionStatus;
  readonly rootKeyVersion?: number;
  readonly wrappedStorageRef?: string | null;
  readonly custodyEvidenceRef?: string | null;
}

export interface SeedProjectDataKeyInput {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly keyVersion: number;
  readonly organizationDataKeyVersion: number;
  readonly status?: DataKeyVersionStatus;
  readonly wrappedStorageRef?: string | null;
}
