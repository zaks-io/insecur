import { parseEnvelopeLayout } from "./envelope-layout.js";

export type EnvelopeBindingReadinessStatus = "ready" | "not_ready";

export type EnvelopeBindingReadinessIssueCode =
  "envelope.layout_invalid" | "envelope.record_type_mismatch" | "envelope.key_version_mismatch";

export interface EnvelopeBindingReadinessIssue {
  readonly code: EnvelopeBindingReadinessIssueCode;
}

export interface EnvelopeBindingReadinessReport {
  readonly status: EnvelopeBindingReadinessStatus;
  readonly issues: readonly EnvelopeBindingReadinessIssue[];
  readonly tenantDataKeyVersion?: number;
}

export interface StoredEnvelopeBindingInput {
  readonly recordType: number;
  readonly envelopeBytes: Uint8Array;
  readonly expectedTenantDataKeyVersion: number;
}

/**
 * Metadata-only envelope binding readiness: parses the stored header and compares the
 * DEK-wrap tenant data key version without decrypting Sensitive Values or key material.
 */
export function checkStoredEnvelopeBindingReadiness(
  input: StoredEnvelopeBindingInput,
): EnvelopeBindingReadinessReport {
  let layout;
  try {
    layout = parseEnvelopeLayout(input.envelopeBytes, input.recordType);
  } catch {
    return {
      status: "not_ready",
      issues: [{ code: "envelope.layout_invalid" }],
    };
  }

  if (layout.tenantDataKeyVersion !== input.expectedTenantDataKeyVersion) {
    return {
      status: "not_ready",
      issues: [{ code: "envelope.key_version_mismatch" }],
      tenantDataKeyVersion: layout.tenantDataKeyVersion,
    };
  }

  return {
    status: "ready",
    issues: [],
    tenantDataKeyVersion: layout.tenantDataKeyVersion,
  };
}
