import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
} from "@insecur/domain";

/**
 * Metadata-only entry describing one delivery or sync impact the Promotion would cause.
 *
 * These are the mutable impact facts the Approval Impact Review compares: which delivery or sync
 * target is affected and the state that matters for drift detection (for example a Secret Sync
 * being enabled/disabled, or a destination revision). Values here are server-side metadata
 * identifiers and state labels only. Never a Sensitive Value, decrypted Sensitive Metadata, or
 * caller-supplied plaintext (ADR-0070/0080).
 */
export interface ImpactReviewDeliveryImpact {
  /** Opaque metadata identifier of the affected delivery/sync target. */
  readonly targetId: string;
  /** Server-derived metadata state label the review compares for drift (e.g. "enabled"). */
  readonly state: string;
}

/**
 * Metadata-only inputs to the Approval Impact Review Fingerprint.
 *
 * The fingerprint is recomputed server-side immediately before approval or final apply. It must
 * change whenever the underlying promotion impact changes (batch, target, or delivery/sync state)
 * so a stale-closure check can detect drift. It must never incorporate Sensitive Values or
 * plaintext (ADR-0070/0080).
 */
export interface ImpactReviewFingerprintInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  /** Exact Draft Version IDs in the Promotion Change Set (one Protected Environment). */
  readonly draftVersionIds: readonly SecretVersionId[];
  /** Published source versions the Draft Versions would replace, when applicable. */
  readonly publishedVersionIds?: readonly SecretVersionId[];
  /** Secrets affected by the batch. */
  readonly secretIds?: readonly SecretId[];
  /** Current delivery/sync impact metadata the Promotion would cause. */
  readonly deliveryImpacts?: readonly ImpactReviewDeliveryImpact[];
}

function stableStrings(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

/**
 * Canonical, metadata-only serialization of the impact inputs. Sorted so ordering of
 * ids/targets does not change the digest, and versioned so a future input-shape change is a
 * deliberate fingerprint break.
 */
function canonicalizeImpactInputs(input: ImpactReviewFingerprintInput): string {
  const deliveryImpacts = [...(input.deliveryImpacts ?? [])]
    .map((impact) => ({ targetId: impact.targetId, state: impact.state }))
    .sort((left, right) =>
      left.targetId === right.targetId
        ? left.state.localeCompare(right.state)
        : left.targetId.localeCompare(right.targetId),
    );

  return JSON.stringify({
    version: 1,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    draftVersionIds: stableStrings(input.draftVersionIds),
    publishedVersionIds: stableStrings(input.publishedVersionIds ?? []),
    secretIds: stableStrings(input.secretIds ?? []),
    deliveryImpacts,
  });
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Compute the Approval Impact Review Fingerprint as a real, server-side SHA-256 digest over the
 * metadata-only impact inputs. Recomputable so a later stale-closure check detects drift when the
 * batch, targets, or delivery/sync impact change.
 */
export async function computeImpactReviewFingerprint(
  input: ImpactReviewFingerprintInput,
): Promise<string> {
  const canonical = canonicalizeImpactInputs(input);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return `sha256:${toHex(new Uint8Array(digest))}`;
}
