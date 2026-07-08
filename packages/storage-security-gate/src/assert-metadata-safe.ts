import { assertMetadataSafe, findMetadataSafetyViolations } from "@insecur/domain";

import type { StorageSecurityGateVerdict } from "./types.js";

export function assertStorageGateVerdictIsMetadataSafe(verdict: StorageSecurityGateVerdict): void {
  assertMetadataSafe(verdict);
}

export function storageGateVerdictContainsSensitiveMaterial(
  verdict: StorageSecurityGateVerdict,
): boolean {
  return findMetadataSafetyViolations(verdict).length > 0;
}

export { findMetadataSafetyViolations } from "@insecur/domain";
