import { findMetadataSafetyViolations } from "@insecur/domain";

import { blockedControl, missingControl, passedControl } from "./control-helpers.js";
import { NO_PLAINTEXT_EXTERNAL_SURFACES } from "./no-plaintext-surface-registry.js";
import { evidencePath, readJsonFile } from "./read-evidence.js";
import type { ReleaseGateControl, ReleaseGateProfile } from "./types.js";

type NoPlaintextRegistryEntry = (typeof NO_PLAINTEXT_EXTERNAL_SURFACES)[number];

interface PassedSweepEvidence extends Record<string, unknown> {
  checked_at: string;
  sentinel_run_id: string;
  target_ref: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function matchesRequiredEvidence(
  record: Record<string, unknown>,
  expected: NoPlaintextRegistryEntry,
): boolean {
  return (
    record.status === "passed" &&
    record.surface === expected.surface &&
    record.evidence_adapter === expected.requiredEvidenceAdapter &&
    record.finding_count === 0
  );
}

function parsePassedSweepEvidence(
  value: unknown,
  expected: NoPlaintextRegistryEntry,
): PassedSweepEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const strings = [record.checked_at, record.target_ref, record.sentinel_run_id];
  const stringsAreValid = strings.every(isNonEmptyString);
  if (!stringsAreValid || !matchesRequiredEvidence(record, expected)) {
    return null;
  }
  return record as PassedSweepEvidence;
}

export function collectNoPlaintextExternalControls(
  evidenceDir: string,
  profile: ReleaseGateProfile,
): ReleaseGateControl[] {
  if (profile !== "small_group_production") {
    return [];
  }

  return NO_PLAINTEXT_EXTERNAL_SURFACES.map((entry) => {
    const raw = readJsonFile(evidencePath(evidenceDir, entry.evidencePath));
    const docs = ["docs/adr/0069-no-plaintext-canary-gate.md"];
    if (raw === null) {
      return missingControl(
        entry.id,
        `No external no-plaintext sweep evidence exists for ${entry.surface}.`,
        docs,
        entry.evidencePath,
      );
    }
    if (findMetadataSafetyViolations(raw).length > 0) {
      return blockedControl({
        id: entry.id,
        summary: `${entry.surface} sweep evidence is not metadata-safe.`,
        docs,
        evidence: [{ kind: "file", path: entry.evidencePath }],
      });
    }
    const parsed = parsePassedSweepEvidence(raw, entry);
    if (!parsed) {
      return blockedControl({
        id: entry.id,
        summary: `${entry.surface} sweep evidence is invalid or did not report zero findings.`,
        docs,
        evidence: [{ kind: "file", path: entry.evidencePath }],
      });
    }
    return passedControl({
      id: entry.id,
      summary: `${entry.surface} no-plaintext sweep passed with zero findings.`,
      docs,
      evidence: [{ kind: "file", path: entry.evidencePath }],
      checkedAt: parsed.checked_at,
    });
  });
}
