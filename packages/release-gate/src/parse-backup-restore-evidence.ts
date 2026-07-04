import { asRecord, hasOneOf, readNumber, readString } from "./evidence-parsers.js";
import type { BackupExportSuccessEvidence, RestoreDrillEvidence } from "@insecur/backup-restore";

export function parseExportSuccessEvidence(value: unknown): BackupExportSuccessEvidence | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = hasOneOf(record, "status", ["passed", "failed"] as const);
  const checkedAt = readString(record, "checked_at");
  const instanceId = readString(record, "instance_id");
  const exportTimestamp = readString(record, "export_timestamp");
  const rootKeyVersion = readNumber(record, "root_key_version");
  const organizationCount = readNumber(record, "organization_count");
  const artifactRef = readString(record, "artifact_ref");
  const expiresAt = readString(record, "expires_at");

  if (
    !status ||
    !checkedAt ||
    !instanceId ||
    !exportTimestamp ||
    rootKeyVersion === null ||
    organizationCount === null ||
    !artifactRef ||
    !expiresAt ||
    typeof record.encryption_verified !== "boolean"
  ) {
    return null;
  }

  const evidence: BackupExportSuccessEvidence = {
    status,
    checked_at: checkedAt,
    instance_id: instanceId,
    export_timestamp: exportTimestamp,
    root_key_version: rootKeyVersion,
    organization_count: organizationCount,
    artifact_ref: artifactRef,
    encryption_verified: record.encryption_verified,
    expires_at: expiresAt,
  };

  const operationId = readString(record, "operation_id");
  if (operationId) {
    evidence.operation_id = operationId;
  }

  return evidence;
}

function parseRestoreDrillScope(
  scope: Record<string, unknown>,
): RestoreDrillEvidence["scope"] | null {
  const instanceId = readString(scope, "instance_id");
  const organizationId = readString(scope, "organization_id");
  const projectId = readString(scope, "project_id");
  if (!instanceId || !organizationId || !projectId) {
    return null;
  }

  const parsedScope: RestoreDrillEvidence["scope"] = {
    instance_id: instanceId,
    organization_id: organizationId,
    project_id: projectId,
  };
  const secretId = readString(scope, "secret_id");
  const environmentId = readString(scope, "environment_id");
  if (secretId) {
    parsedScope.secret_id = secretId;
  }
  if (environmentId) {
    parsedScope.environment_id = environmentId;
  }
  return parsedScope;
}

export function parseRestoreDrillEvidence(value: unknown): RestoreDrillEvidence | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = hasOneOf(record, "status", ["passed", "failed"] as const);
  const checkedAt = readString(record, "checked_at");
  const actor = readString(record, "actor");
  const scope = asRecord(record.scope);
  const rto = asRecord(record.rto);
  const canary = asRecord(record.canary_verification);
  const artifactRef = readString(record, "artifact_ref");
  if (
    !status ||
    !checkedAt ||
    !actor ||
    !scope ||
    !rto ||
    !canary ||
    !artifactRef ||
    typeof record.encryption_verified !== "boolean"
  ) {
    return null;
  }

  const parsedScope = parseRestoreDrillScope(scope);
  const startedAt = readString(rto, "started_at");
  const completedAt = readString(rto, "completed_at");
  const durationSeconds = readNumber(rto, "duration_seconds");
  const targetSeconds = readNumber(rto, "target_seconds");
  const canaryStatus = hasOneOf(canary, "status", ["passed", "failed"] as const);
  const canaryCheckedAt = readString(canary, "checked_at");
  const variableKey = readString(canary, "variable_key");
  if (
    !parsedScope ||
    !startedAt ||
    !completedAt ||
    durationSeconds === null ||
    targetSeconds === null ||
    !canaryStatus ||
    !canaryCheckedAt ||
    !variableKey
  ) {
    return null;
  }

  const evidence: RestoreDrillEvidence = {
    status,
    checked_at: checkedAt,
    actor,
    scope: parsedScope,
    rto: {
      started_at: startedAt,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
      target_seconds: targetSeconds,
    },
    canary_verification: {
      status: canaryStatus,
      checked_at: canaryCheckedAt,
      variable_key: variableKey,
    },
    encryption_verified: record.encryption_verified,
    artifact_ref: artifactRef,
  };

  const restoreTargetRef = readString(record, "restore_target_ref");
  if (restoreTargetRef) {
    evidence.restore_target_ref = restoreTargetRef;
  }

  return evidence;
}
