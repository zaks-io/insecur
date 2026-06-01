import type { OrganizationId, ProjectId } from "@insecur/domain";

import type {
  OrganizationDataKeyMetadata,
  ProjectDataKeyMetadata,
  TenantDataKeyMetadataReader,
} from "./data-key-metadata.js";
import { RootKeyNotConfiguredError } from "./errors.js";
import type { RootKeyProvider } from "./keyring.js";

export type DataKeyReadinessIssueCode =
  | "root_key.unreachable"
  | "organization_data_key.missing"
  | "organization_data_key.inactive"
  | "project_data_key.missing"
  | "project_data_key.inactive"
  | "project_data_key.org_version_mismatch";

export interface DataKeyReadinessIssue {
  readonly code: DataKeyReadinessIssueCode;
  readonly scope: "organization" | "project";
}

export type DataKeyReadinessStatus = "ready" | "not_ready";

export interface DataKeyReadinessReport {
  readonly status: DataKeyReadinessStatus;
  readonly issues: readonly DataKeyReadinessIssue[];
}

export interface KeyringReadinessInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly metadata: TenantDataKeyMetadataReader;
  readonly rootKeyProvider: RootKeyProvider;
}

function inactiveOrganizationIssue(): DataKeyReadinessIssue {
  return {
    code: "organization_data_key.inactive",
    scope: "organization",
  };
}

function inactiveProjectIssue(): DataKeyReadinessIssue {
  return {
    code: "project_data_key.inactive",
    scope: "project",
  };
}

async function collectRootReadinessIssues(
  rootKeyProvider: RootKeyProvider,
): Promise<DataKeyReadinessIssue[]> {
  try {
    await rootKeyProvider.getRootKeyBytes(1);
    return [];
  } catch {
    return [{ code: "root_key.unreachable", scope: "organization" }];
  }
}

function collectOrganizationReadinessIssues(
  organizationKey: OrganizationDataKeyMetadata | null,
): DataKeyReadinessIssue[] {
  if (!organizationKey) {
    return [{ code: "organization_data_key.missing", scope: "organization" }];
  }
  if (organizationKey.status !== "active") {
    return [inactiveOrganizationIssue()];
  }
  return [];
}

function collectProjectReadinessIssues(
  organizationKey: OrganizationDataKeyMetadata | null,
  projectKey: ProjectDataKeyMetadata | null,
): DataKeyReadinessIssue[] {
  if (!projectKey) {
    return [{ code: "project_data_key.missing", scope: "project" }];
  }
  if (projectKey.status !== "active") {
    return [inactiveProjectIssue()];
  }
  if (organizationKey && projectKey.organizationDataKeyVersion !== organizationKey.keyVersion) {
    return [{ code: "project_data_key.org_version_mismatch", scope: "project" }];
  }
  return [];
}

/** Metadata-only readiness for tenant data keys; never returns key material. */
export async function checkTenantDataKeyReadiness(
  input: KeyringReadinessInput,
): Promise<DataKeyReadinessReport> {
  const organizationKey = await input.metadata.getActiveOrganizationDataKey(input.organizationId);
  const projectKey = await input.metadata.getActiveProjectDataKey(
    input.organizationId,
    input.projectId,
  );
  const issues = [
    ...(await collectRootReadinessIssues(input.rootKeyProvider)),
    ...collectOrganizationReadinessIssues(organizationKey),
    ...collectProjectReadinessIssues(organizationKey, projectKey),
  ];

  return {
    status: issues.length === 0 ? "ready" : "not_ready",
    issues,
  };
}

export function assertTenantDataKeyReadiness(report: DataKeyReadinessReport): void {
  if (report.status === "ready") {
    return;
  }
  const hasRootIssue = report.issues.some((issue) => issue.code === "root_key.unreachable");
  if (hasRootIssue) {
    throw new RootKeyNotConfiguredError();
  }
  throw new TenantDataKeyNotReadyError();
}

/** Active tenant data keys are missing or not usable for decrypt paths. */
export class TenantDataKeyNotReadyError extends Error {
  constructor() {
    super("tenant data keys are not ready");
    this.name = "TenantDataKeyNotReadyError";
  }
}
