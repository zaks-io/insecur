import type { EnvironmentId, OrganizationId, ProjectId, UserId } from "@insecur/domain";
import { NotImplementedError } from "@insecur/domain";

export interface ActorRef {
  type: "user";
  userId: UserId;
}

/** Resource coordinate for scope-first authorization evaluation. */
export interface ResourceCoordinate {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
}

/** Metadata-only Effective Access summary (no Sensitive Values). */
export interface EffectiveAccessResult {
  organizationId: OrganizationId;
  scopes: readonly string[];
}

/**
 * Expands Membership and Role into coordinate-bound Effective Access.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export function resolveEffectiveAccess(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
): Promise<EffectiveAccessResult> {
  void actor;
  void coordinate;
  return Promise.reject(new NotImplementedError("resolveEffectiveAccess"));
}
