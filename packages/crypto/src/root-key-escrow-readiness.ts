export const ROOT_KEY_ESCROW_EVIDENCE_PREFIX = "escrow-record://" as const;

export type RootKeyEscrowReadinessStatus = "ready" | "not_ready";

export type RootKeyEscrowReadinessIssueCode =
  "root_key_escrow.evidence_missing" | "root_key_escrow.evidence_invalid";

export interface RootKeyEscrowReadinessIssue {
  readonly code: RootKeyEscrowReadinessIssueCode;
}

export interface RootKeyEscrowReadinessReport {
  readonly status: RootKeyEscrowReadinessStatus;
  readonly issues: readonly RootKeyEscrowReadinessIssue[];
  readonly custodyEvidenceRef?: string;
  readonly rootKeyVersion: number;
}

export interface RootKeyEscrowReadinessInput {
  readonly rootKeyVersion: number;
  readonly custodyEvidenceRef: string | null | undefined;
}

/** Metadata-only root-key escrow readiness from organization data-key custody evidence. */
export function checkRootKeyEscrowReadiness(
  input: RootKeyEscrowReadinessInput,
): RootKeyEscrowReadinessReport {
  const ref = input.custodyEvidenceRef ?? null;
  if (ref === null || ref.length === 0) {
    return {
      status: "not_ready",
      issues: [{ code: "root_key_escrow.evidence_missing" }],
      rootKeyVersion: input.rootKeyVersion,
    };
  }

  if (!ref.startsWith(ROOT_KEY_ESCROW_EVIDENCE_PREFIX)) {
    return {
      status: "not_ready",
      issues: [{ code: "root_key_escrow.evidence_invalid" }],
      custodyEvidenceRef: ref,
      rootKeyVersion: input.rootKeyVersion,
    };
  }

  return {
    status: "ready",
    issues: [],
    custodyEvidenceRef: ref,
    rootKeyVersion: input.rootKeyVersion,
  };
}
