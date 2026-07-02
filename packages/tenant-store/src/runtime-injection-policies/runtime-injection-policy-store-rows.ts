import {
  environmentId,
  organizationId,
  projectId,
  runtimePolicyId,
  runtimePolicyVersionId,
  secretId,
  type DisplayName,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";

import {
  runtimeInjectionPolicies,
  runtimeInjectionPolicyVersions,
} from "../db/schema/tenant-secrets.js";
import type {
  RuntimeInjectionPolicyRow,
  RuntimeInjectionPolicyVersionRow,
  RuntimeInjectionDeliveryMode,
} from "./types.js";

export const policyRowSelect = {
  id: runtimeInjectionPolicies.id,
  orgId: runtimeInjectionPolicies.orgId,
  projectId: runtimeInjectionPolicies.projectId,
  environmentId: runtimeInjectionPolicies.environmentId,
  displayName: runtimeInjectionPolicies.displayName,
  activeVersionId: runtimeInjectionPolicies.activeVersionId,
  disabledAt: runtimeInjectionPolicies.disabledAt,
  createdAt: runtimeInjectionPolicies.createdAt,
} as const;

export const policyVersionRowSelect = {
  id: runtimeInjectionPolicyVersions.id,
  orgId: runtimeInjectionPolicyVersions.orgId,
  policyId: runtimeInjectionPolicyVersions.policyId,
  versionNumber: runtimeInjectionPolicyVersions.versionNumber,
  displayNameSnapshot: runtimeInjectionPolicyVersions.displayNameSnapshot,
  secretIds: runtimeInjectionPolicyVersions.secretIds,
  variableKeys: runtimeInjectionPolicyVersions.variableKeys,
  command: runtimeInjectionPolicyVersions.command,
  commandFingerprint: runtimeInjectionPolicyVersions.commandFingerprint,
  ttlSeconds: runtimeInjectionPolicyVersions.ttlSeconds,
  deliveryMode: runtimeInjectionPolicyVersions.deliveryMode,
  createdAt: runtimeInjectionPolicyVersions.createdAt,
} as const;

export interface PolicyRowRecord {
  id: string;
  orgId: string;
  projectId: string;
  environmentId: string;
  displayName: string;
  activeVersionId: string | null;
  disabledAt: Date | null;
  createdAt: Date;
}

export function toPolicyRow(row: PolicyRowRecord): RuntimeInjectionPolicyRow {
  return {
    policyId: runtimePolicyId.brand(row.id),
    organizationId: organizationId.brand(row.orgId),
    projectId: projectId.brand(row.projectId),
    environmentId: environmentId.brand(row.environmentId),
    displayName: row.displayName as DisplayName,
    activeVersionId: row.activeVersionId ? runtimePolicyVersionId.brand(row.activeVersionId) : null,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
  };
}

export function toPolicyVersionRow(row: {
  id: string;
  orgId: string;
  policyId: string;
  versionNumber: number;
  displayNameSnapshot: string;
  secretIds: string[];
  variableKeys: string[];
  command: string;
  commandFingerprint: string | null;
  ttlSeconds: number;
  deliveryMode: string;
  createdAt: Date;
}): RuntimeInjectionPolicyVersionRow {
  return {
    policyVersionId: runtimePolicyVersionId.brand(row.id),
    policyId: runtimePolicyId.brand(row.policyId),
    organizationId: organizationId.brand(row.orgId),
    versionNumber: row.versionNumber,
    displayNameSnapshot: row.displayNameSnapshot as DisplayName,
    secretIds: row.secretIds.map((id) => secretId.brand(id)),
    variableKeys: row.variableKeys as VariableKey[],
    command: row.command,
    commandFingerprint: row.commandFingerprint,
    ttlSeconds: row.ttlSeconds,
    deliveryMode: row.deliveryMode as RuntimeInjectionDeliveryMode,
    createdAt: row.createdAt,
  };
}

export function serializePolicyBindings(input: {
  secretIds: readonly SecretId[];
  variableKeys: readonly VariableKey[];
}): { secretIds: string[]; variableKeys: string[] } {
  return {
    secretIds: [...input.secretIds],
    variableKeys: [...input.variableKeys],
  };
}

export function requireUpdatedPolicyRow(
  rows: PolicyRowRecord[],
  missingMessage: string,
): RuntimeInjectionPolicyRow {
  const row = rows[0];
  if (!row) {
    throw new Error(missingMessage);
  }
  return toPolicyRow(row);
}
