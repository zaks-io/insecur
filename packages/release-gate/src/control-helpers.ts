import type { ReleaseGateControl } from "./types.js";

interface ControlInput {
  id: string;
  summary: string;
  docs: string[];
  evidence: ReleaseGateControl["evidence"];
  checkedAt?: string | undefined;
}

export function missingControl(
  id: string,
  summary: string,
  docs: string[],
  expectedEvidencePath: string,
): ReleaseGateControl {
  return {
    id,
    status: "missing_evidence",
    blocking: true,
    summary,
    blocking_reason: `Expected metadata-only evidence at ${expectedEvidencePath}`,
    evidence: [{ kind: "file", path: expectedEvidencePath }],
    docs,
  };
}

export function blockedControl(input: ControlInput): ReleaseGateControl {
  return {
    id: input.id,
    status: "blocked",
    blocking: true,
    summary: input.summary,
    blocking_reason: input.summary,
    evidence: input.evidence,
    docs: input.docs,
    ...(input.checkedAt ? { checked_at: input.checkedAt } : {}),
  };
}

export function passedControl(input: ControlInput): ReleaseGateControl {
  return {
    id: input.id,
    status: "passed",
    blocking: false,
    summary: input.summary,
    evidence: input.evidence,
    docs: input.docs,
    ...(input.checkedAt ? { checked_at: input.checkedAt } : {}),
  };
}
