import type { RuntimeInjectionPolicyVersionReadPayload } from "@insecur/worker-kit/rpc/runtime-run-policies-rpc-contract";
import { toIsoTimestamp } from "@insecur/tenant-store";

export type RuntimeInjectionPolicyVersionRead = RuntimeInjectionPolicyVersionReadPayload;

export function toRuntimeInjectionPolicyVersionRead(version: {
  policyVersionId: RuntimeInjectionPolicyVersionRead["policyVersionId"];
  versionNumber: number;
  displayNameSnapshot: RuntimeInjectionPolicyVersionRead["displayNameSnapshot"];
  secretIds: readonly RuntimeInjectionPolicyVersionRead["secretIds"][number][];
  variableKeys: readonly string[];
  command: string;
  commandFingerprint: string | null;
  ttlSeconds: number;
  deliveryMode: string;
  createdAt: Date;
}): RuntimeInjectionPolicyVersionRead {
  return {
    policyVersionId: version.policyVersionId,
    versionNumber: version.versionNumber,
    displayNameSnapshot: version.displayNameSnapshot,
    secretIds: version.secretIds,
    variableKeys: version.variableKeys,
    command: version.command,
    commandFingerprint: version.commandFingerprint,
    ttlSeconds: version.ttlSeconds,
    deliveryMode: version.deliveryMode,
    createdAt: toIsoTimestamp(version.createdAt),
  };
}
