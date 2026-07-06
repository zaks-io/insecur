import type { EnvironmentDeployKeyAuthMethodRow } from "./environment-deploy-key-auth-method-row.js";
import { toEpochSeconds, toIsoTimestamp } from "@insecur/tenant-store";

/** Metadata-only deploy key view for status, plan, and audit output. */
export interface EnvironmentDeployKeyMetadata {
  readonly id: string;
  readonly organizationId: string;
  readonly machineIdentityId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly runtimePolicyKeyIds: readonly string[];
  readonly credentialScopes: readonly string[];
  readonly status: "active" | "disabled";
  readonly expiresAt: string | null;
  readonly nonExpiring: boolean;
  readonly nonExpiringRiskVisible: boolean;
  readonly rotationIntervalSeconds: number | null;
  readonly rotationReminderIntervalSeconds: number | null;
  readonly rotationReminderDue: boolean;
  readonly createdAt: string;
}

function isRotationReminderDue(row: EnvironmentDeployKeyAuthMethodRow, nowEpoch: number): boolean {
  if (row.rotationReminderIntervalSeconds === null || row.rotationIntervalSeconds === null) {
    return false;
  }
  const createdAtEpoch = toEpochSeconds(row.createdAt);
  const elapsedSeconds = nowEpoch - createdAtEpoch;
  const interval = row.rotationIntervalSeconds;
  const reminder = row.rotationReminderIntervalSeconds;
  const rotationBoundariesCrossed = Math.floor(elapsedSeconds / interval);
  if (rotationBoundariesCrossed > 0) {
    return true;
  }
  return interval - elapsedSeconds <= reminder;
}

export function buildEnvironmentDeployKeyMetadata(
  row: EnvironmentDeployKeyAuthMethodRow,
  nowEpoch: number = Math.floor(Date.now() / 1000),
): EnvironmentDeployKeyMetadata {
  return {
    id: row.id,
    organizationId: row.organizationId,
    machineIdentityId: row.machineIdentityId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    runtimePolicyKeyIds: [...row.runtimePolicyKeyIds],
    credentialScopes: [...row.credentialScopes],
    status: row.status,
    expiresAt: row.expiresAt === null ? null : toIsoTimestamp(row.expiresAt),
    nonExpiring: row.nonExpiring,
    nonExpiringRiskVisible: row.nonExpiring,
    rotationIntervalSeconds: row.rotationIntervalSeconds,
    rotationReminderIntervalSeconds: row.rotationReminderIntervalSeconds,
    rotationReminderDue: isRotationReminderDue(row, nowEpoch),
    createdAt: toIsoTimestamp(row.createdAt),
  };
}
