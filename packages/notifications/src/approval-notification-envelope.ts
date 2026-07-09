/**
 * Approval Notifications are alert-only and metadata-safe (product-spec §10, ADR-0017). The
 * payload carries only enough to route an approver to the authenticated approval view: opaque
 * IDs, a status, a created timestamp, and a non-authorizing deep link. It never carries Approval
 * Context Note plaintext, Sensitive Values, decrypted Sensitive Metadata, Display Names, approval
 * impact details, or approve/reject action links.
 */
export interface ApprovalNotificationEnvelope {
  /** Discriminator so in-app consumers can distinguish approval alerts from webhook envelopes. */
  readonly kind: "approval_notification";
  /** Alert-only: the approver must authenticate before seeing anything. */
  readonly alert: "approval_pending";
  readonly organizationId: string;
  /** Opaque Approval Request reference (`apr_…`). Not a Display Name. */
  readonly approvalRequestId: string;
  readonly createdAt: string;
  /** Non-authorizing deep link to the authenticated approval view. */
  readonly deepLinkUrl: string;
}

/**
 * Keys the approval envelope is allowed to carry. Anything else is a leak: the assertion below
 * rejects the envelope loudly rather than delivering a payload that might contain a Display Name,
 * impact detail, action link, or Sensitive Value.
 */
const APPROVAL_ENVELOPE_ALLOWED_KEYS = new Set<keyof ApprovalNotificationEnvelope>([
  "kind",
  "alert",
  "organizationId",
  "approvalRequestId",
  "createdAt",
  "deepLinkUrl",
]);

/**
 * Fields the approver-facing payload must never contain, enumerated from product-spec §10 and
 * ADR-0017 so the safety check is explicit rather than implied by the type. Presence of any of
 * these keys (at any casing seen in the codebase) fails loudly.
 */
const APPROVAL_ENVELOPE_FORBIDDEN_KEYS = [
  "contextNote",
  "approvalContextNote",
  "rejectionNote",
  "displayName",
  "displayNames",
  "sensitiveValue",
  "sensitiveMetadata",
  "secret",
  "secretValue",
  "impact",
  "approvalImpact",
  "impactReview",
  "approveUrl",
  "rejectUrl",
  "approveLink",
  "rejectLink",
  "actionUrl",
  "actionLink",
] as const;

function assertNoForbiddenKeys(record: Record<string, unknown>): void {
  for (const forbidden of APPROVAL_ENVELOPE_FORBIDDEN_KEYS) {
    if (forbidden in record) {
      throw new Error(`approval notification envelope contains forbidden key: ${forbidden}`);
    }
  }
}

/**
 * The authenticated approval view route (INS-381): `/orgs/:orgId/approvals/:approvalRequestId`.
 * The link only routes to the view; it does not approve, reject, or satisfy any challenge.
 */
/** Linear-time trailing-slash trim (avoids the polynomial backtracking of `/\/+$/`). */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* "/" */) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function buildApprovalDeepLinkUrl(input: {
  readonly webBaseUrl: string;
  readonly organizationId: string;
  readonly approvalRequestId: string;
}): string {
  const base = stripTrailingSlashes(input.webBaseUrl);
  return `${base}/orgs/${input.organizationId}/approvals/${input.approvalRequestId}`;
}

function assertOnlyAllowlistedKeys(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (!APPROVAL_ENVELOPE_ALLOWED_KEYS.has(key as keyof ApprovalNotificationEnvelope)) {
      throw new Error(`approval notification envelope contains disallowed key: ${key}`);
    }
  }
  assertNoForbiddenKeys(record);
}

function assertAlertShape(record: Record<string, unknown>): void {
  if (record.kind !== "approval_notification" || record.alert !== "approval_pending") {
    throw new Error("approval notification envelope has an unexpected alert shape");
  }
}

/** The deep link must be an https URL that resolves exactly to the approval view, action-free. */
function assertDeepLinkSafe(envelope: ApprovalNotificationEnvelope): void {
  const approvalViewPath = `/orgs/${envelope.organizationId}/approvals/${envelope.approvalRequestId}`;
  let parsed: URL;
  try {
    parsed = new URL(envelope.deepLinkUrl);
  } catch {
    throw new Error("approval notification deep link is not a valid absolute URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("approval notification deep link must be https");
  }
  if (parsed.pathname !== approvalViewPath) {
    throw new Error("approval notification deep link must target the authenticated approval view");
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error("approval notification deep link must carry no query or fragment action");
  }
}

/**
 * Fails loudly when the envelope carries anything beyond the metadata-safe allowlist, when the
 * deep link points anywhere other than the authenticated approval view, or when the link smuggles
 * an approve/reject action. This is the load-bearing security gate; keep it exhaustive.
 */
export function assertApprovalNotificationEnvelopeSafe(
  envelope: ApprovalNotificationEnvelope,
): void {
  const record = envelope as unknown as Record<string, unknown>;
  assertOnlyAllowlistedKeys(record);
  assertAlertShape(record);
  assertDeepLinkSafe(envelope);
}

export function serializeApprovalNotificationEnvelope(
  envelope: ApprovalNotificationEnvelope,
): string {
  assertApprovalNotificationEnvelopeSafe(envelope);
  return JSON.stringify(envelope);
}
