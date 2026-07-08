import {
  isRecord,
  requiredBooleanField,
  requiredNumberField,
  requiredStringField,
} from "./approval-parse-helpers.js";
import type {
  ConsoleApprovalRequestImpactDraftVersion,
  ConsoleApprovalRequestImpactReview,
} from "./approval-request-impact-types.js";

function parseImpactDraftVersion(entry: unknown): ConsoleApprovalRequestImpactDraftVersion | null {
  if (!isRecord(entry)) {
    return null;
  }
  const secretId = requiredStringField(entry, "secretId");
  const secretVersionId = requiredStringField(entry, "secretVersionId");
  const valueByteLength = requiredNumberField(entry, "valueByteLength");
  const encodingClass = requiredStringField(entry, "encodingClass");
  const secretShapeMatchVerdict = requiredStringField(entry, "secretShapeMatchVerdict");
  if (
    secretId === null ||
    secretVersionId === null ||
    valueByteLength === null ||
    encodingClass === null ||
    secretShapeMatchVerdict === null
  ) {
    return null;
  }
  return {
    secretId,
    secretVersionId,
    valueByteLength,
    encodingClass,
    secretShapeMatchVerdict,
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

function parseRuntimeInjectionPolicy(
  policy: unknown,
): ConsoleApprovalRequestImpactReview["delivery"]["runtimeInjectionPolicies"][number] | null {
  if (!isRecord(policy)) {
    return null;
  }
  const policyId = requiredStringField(policy, "policyId");
  const activeVersionId = requiredStringField(policy, "activeVersionId");
  const commandFingerprint = requiredStringField(policy, "commandFingerprint");
  const deliveryMode = requiredStringField(policy, "deliveryMode");
  const ttlSeconds = requiredNumberField(policy, "ttlSeconds");
  const secretIds = policy.secretIds;
  if (
    policyId === null ||
    activeVersionId === null ||
    commandFingerprint === null ||
    deliveryMode === null ||
    ttlSeconds === null ||
    !isStringArray(secretIds)
  ) {
    return null;
  }
  return { policyId, activeVersionId, commandFingerprint, deliveryMode, secretIds, ttlSeconds };
}

function parseDeliverySection(
  delivery: unknown,
): ConsoleApprovalRequestImpactReview["delivery"] | null {
  if (!isRecord(delivery)) {
    return null;
  }
  const policies = delivery.runtimeInjectionPolicies;
  const providerSyncImpact = delivery.providerSyncImpact;
  if (!Array.isArray(policies) || !Array.isArray(providerSyncImpact)) {
    return null;
  }
  const runtimeInjectionPolicies = policies.flatMap((policy) => {
    const parsed = parseRuntimeInjectionPolicy(policy);
    return parsed === null ? [] : [parsed];
  });
  if (runtimeInjectionPolicies.length !== policies.length) {
    return null;
  }
  if (!providerSyncImpact.every((impact) => typeof impact === "string")) {
    return null;
  }
  return { runtimeInjectionPolicies, providerSyncImpact };
}

function parseDraftVersions(
  rows: unknown,
): readonly ConsoleApprovalRequestImpactDraftVersion[] | null {
  if (!Array.isArray(rows)) {
    return null;
  }
  const draftVersions: ConsoleApprovalRequestImpactDraftVersion[] = [];
  for (const row of rows) {
    const parsed = parseImpactDraftVersion(row);
    if (parsed === null) {
      return null;
    }
    draftVersions.push(parsed);
  }
  return draftVersions;
}

function parseFingerprintAtCreation(entry: Record<string, unknown>): string | null | undefined {
  if (entry.fingerprintAtCreation === null || entry.fingerprintAtCreation === undefined) {
    return null;
  }
  return typeof entry.fingerprintAtCreation === "string" ? entry.fingerprintAtCreation : undefined;
}

export function parseImpactReview(entry: unknown): ConsoleApprovalRequestImpactReview | null {
  if (!isRecord(entry)) {
    return null;
  }
  const fingerprintAtCreation = parseFingerprintAtCreation(entry);
  const currentFingerprint = requiredStringField(entry, "currentFingerprint");
  const isStale = requiredBooleanField(entry, "isStale");
  const draftVersions = parseDraftVersions(entry.draftVersions);
  const delivery = parseDeliverySection(entry.delivery);
  if (
    fingerprintAtCreation === undefined ||
    currentFingerprint === null ||
    isStale === null ||
    draftVersions === null ||
    delivery === null
  ) {
    return null;
  }
  return {
    fingerprintAtCreation,
    currentFingerprint,
    isStale,
    draftVersions,
    delivery,
  };
}
