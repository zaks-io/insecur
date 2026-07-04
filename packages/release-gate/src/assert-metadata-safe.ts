import type { SecurityEvidenceBundle } from "./types.js";
import { findMetadataSafetyViolations } from "@insecur/domain";

export function assertBundleIsMetadataSafe(bundle: SecurityEvidenceBundle): void {
  const violations = findMetadataSafetyViolations(bundle);
  if (violations.length > 0) {
    throw new Error(`Security evidence bundle is not metadata-safe: ${violations.join("; ")}`);
  }
}

export function bundleContainsSensitiveMaterial(bundle: SecurityEvidenceBundle): boolean {
  return findMetadataSafetyViolations(bundle).length > 0;
}

export { findMetadataSafetyViolations } from "@insecur/domain";
