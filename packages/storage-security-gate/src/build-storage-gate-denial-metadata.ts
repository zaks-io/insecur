import { assertMetadataSafe } from "@insecur/domain";

import type { StorageSecurityGateControlId } from "./control-ids.js";
import type { StorageGateDeliveryErrorCode } from "./error-codes.js";
import type { StorageGateDeliveryPath } from "./delivery-paths.js";
import type {
  StorageGateEvidenceRef,
  StorageGateVerdictStatus,
  StorageSecurityGateVerdict,
} from "./types.js";

export interface StorageGateDeliveryDenialMetadata {
  readonly reasonCode: StorageGateDeliveryErrorCode;
  readonly deliveryPath: StorageGateDeliveryPath;
  readonly gateStatus: StorageGateVerdictStatus;
  readonly blockedControlIds: readonly StorageSecurityGateControlId[];
  readonly checkedAt: string;
  readonly evidence: readonly StorageGateEvidenceRef[];
}

function blockedControlIds(
  verdict: StorageSecurityGateVerdict,
): readonly StorageSecurityGateControlId[] {
  return verdict.controls
    .filter((control) => control.status === "blocked" || control.status === "unknown")
    .map((control) => control.id);
}

/** Metadata-only denial facts for audit and operation records. */
export function buildStorageGateDeliveryDenialMetadata(input: {
  verdict: StorageSecurityGateVerdict;
  path: StorageGateDeliveryPath;
  reasonCode: StorageGateDeliveryErrorCode;
}): StorageGateDeliveryDenialMetadata {
  const metadata: StorageGateDeliveryDenialMetadata = {
    reasonCode: input.reasonCode,
    deliveryPath: input.path,
    gateStatus: input.verdict.status,
    blockedControlIds: blockedControlIds(input.verdict),
    checkedAt: input.verdict.checked_at,
    evidence: input.verdict.evidence,
  };
  assertMetadataSafe(metadata);
  return metadata;
}
