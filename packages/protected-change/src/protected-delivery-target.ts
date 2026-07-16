import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import { sha256Hex } from "./sha256-hex.js";

/**
 * The exact protected-execution paths that must present current matching approval evidence before
 * they run (INS-87). Each names one delivery-side workflow; the enforcement seam is caller-agnostic.
 */
export const PROTECTED_DELIVERY_TARGET_KINDS = [
  "delivery_config",
  "secret_sync_enable",
  "secret_sync_run",
  "cloudflare_worker_secret_deploy",
] as const;

export type ProtectedDeliveryTargetKind = (typeof PROTECTED_DELIVERY_TARGET_KINDS)[number];

/**
 * The exact, metadata-only coordinate of a protected delivery execution. Approval evidence must be
 * scoped to all of these: tenant (organization), project, Protected Environment, the delivery
 * operation kind, and the exact opaque target id. A valid approval for one target must never
 * authorize a different one. `targetId` is an opaque resource id (Secret Sync id, delivery config
 * item id) — never a Display Name, never a Sensitive Value.
 */
export interface ProtectedDeliveryTarget {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly kind: ProtectedDeliveryTargetKind;
  readonly targetId: string;
}

function canonicalDeliveryTargetPayload(target: ProtectedDeliveryTarget): string {
  return JSON.stringify({
    organizationId: target.organizationId,
    projectId: target.projectId,
    environmentId: target.environmentId,
    kind: target.kind,
    targetId: target.targetId,
  });
}

/**
 * Deterministic metadata-only fingerprint over the exact delivery target coordinate. The
 * enforcement seam records this at approval time and recomputes it from the live requested target
 * at execution time; any drift in tenant, project, environment, operation kind, or target id
 * produces a different fingerprint and fails the exact-target match closed.
 */
export async function computeDeliveryTargetFingerprint(
  target: ProtectedDeliveryTarget,
): Promise<string> {
  const digest = await sha256Hex(canonicalDeliveryTargetPayload(target));
  return `sha256:${digest}`;
}
