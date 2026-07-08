import { STORAGE_GATE_ERROR_CODES } from "./error-codes.js";
import type {
  StorageGateControl,
  StorageGateVerdictStatus,
  StorageSecurityGateScope,
  StorageSecurityGateVerdict,
} from "./types.js";
import type { StorageGateDeliveryErrorCode } from "./error-codes.js";
import { STORAGE_SECURITY_GATE_SCHEMA_VERSION } from "./types.js";
import type { StorageGateEvidenceRef } from "./types.js";

function collectEvidenceRefs(controls: readonly StorageGateControl[]): StorageGateEvidenceRef[] {
  const seen = new Set<string>();
  const evidence: StorageGateEvidenceRef[] = [];

  for (const control of controls) {
    for (const ref of control.evidence) {
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      evidence.push(ref);
    }
  }

  return evidence;
}

export function deriveStorageGateVerdictStatus(
  controls: readonly StorageGateControl[],
): StorageGateVerdictStatus {
  if (controls.some((control) => control.status === "blocked")) {
    return "blocked";
  }
  if (controls.some((control) => control.status === "unknown")) {
    return "unknown";
  }
  return "passed";
}

export function isStorageGateDeliveryBlocking(status: StorageGateVerdictStatus): boolean {
  return status !== "passed";
}

export function deriveStorageGateDeliveryError(
  status: StorageGateVerdictStatus,
): StorageGateDeliveryErrorCode | undefined {
  if (status === "blocked") {
    return STORAGE_GATE_ERROR_CODES.gateBlocked;
  }
  if (status === "unknown") {
    return STORAGE_GATE_ERROR_CODES.gateUnknown;
  }
  return undefined;
}

export function composeStorageSecurityGateVerdict(input: {
  scope: StorageSecurityGateScope;
  controls: readonly StorageGateControl[];
  checkedAt: string;
}): StorageSecurityGateVerdict {
  const status = deriveStorageGateVerdictStatus(input.controls);
  const deliveryBlocking = isStorageGateDeliveryBlocking(status);
  const error = deriveStorageGateDeliveryError(status);

  return {
    schema_version: STORAGE_SECURITY_GATE_SCHEMA_VERSION,
    status,
    scope: input.scope,
    controls: input.controls,
    evidence: collectEvidenceRefs(input.controls),
    checked_at: input.checkedAt,
    delivery_blocking: deliveryBlocking,
    ...(error ? { error } : {}),
  };
}
