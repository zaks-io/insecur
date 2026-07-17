import type {
  DeliveryRiskPolicyId,
  DeliveryRiskPolicyPreset,
  EnvironmentId,
  OrganizationId,
  PreviewAutomationOptInId,
  ProjectId,
  UserId,
} from "@insecur/domain";

/** Project-scoped Delivery Risk Policy record (ADR-0043). Metadata-only, no Sensitive Values. */
export interface DeliveryRiskPolicyRow {
  id: DeliveryRiskPolicyId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  presetKey: DeliveryRiskPolicyPreset;
  presetVersion: number;
  /** Monotonic per-project policy revision; every preset change increments it. */
  policyVersion: number;
  selectedByUserId: UserId;
  selectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertDeliveryRiskPolicyInput {
  /** Used only when no policy row exists yet for the Project. */
  policyId: DeliveryRiskPolicyId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  presetKey: DeliveryRiskPolicyPreset;
  presetVersion: number;
  selectedByUserId: UserId;
}

/** Per-Environment Preview Automation Opt-In with explicit who/when metadata (ADR-0043, INS-88). */
export interface PreviewAutomationOptInRow {
  id: PreviewAutomationOptInId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  enabledByUserId: UserId;
  enabledAt: Date;
  revokedAt: Date | null;
  revokedByUserId: UserId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnablePreviewAutomationOptInInput {
  /** Used only when no opt-in row exists yet for the Environment. */
  optInId: PreviewAutomationOptInId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  enabledByUserId: UserId;
}

export interface RevokePreviewAutomationOptInInput {
  organizationId: OrganizationId;
  environmentId: EnvironmentId;
  revokedByUserId: UserId;
}

export function isActivePreviewAutomationOptIn(
  row: PreviewAutomationOptInRow | null,
): row is PreviewAutomationOptInRow {
  return row !== null && row.revokedAt === null;
}
