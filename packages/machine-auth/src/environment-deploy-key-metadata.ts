import type { EnvironmentDeployKeyAuthMethodRow } from "./environment-deploy-key-auth-method-row.js";

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
  const createdAtEpoch = Math.floor(row.createdAt.getTime() / 1000);
  const elapsedSeconds = nowEpoch - createdAtEpoch;
  const interval = row.rotationIntervalSeconds;
  const reminder = row.rotationReminderIntervalSeconds;
  const nextRotationAt = Math.ceil((elapsedSeconds + 1) / interval) * interval;
  return nextRotationAt - elapsedSeconds <= reminder;
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
    expiresAt: row.expiresAt?.toISOString() ?? null,
    nonExpiring: row.nonExpiring,
    nonExpiringRiskVisible: row.nonExpiring,
    rotationIntervalSeconds: row.rotationIntervalSeconds,
    rotationReminderIntervalSeconds: row.rotationReminderIntervalSeconds,
    rotationReminderDue: isRotationReminderDue(row, nowEpoch),
    createdAt: row.createdAt.toISOString(),
  };
}
