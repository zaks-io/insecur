import type { OrganizationId, ProjectId } from "@insecur/domain";
import type { LoadMembershipsInput } from "./load-memberships.js";
import type { MembershipRow } from "./membership-row.js";
import type { ActorRef, LoadMembershipsFn } from "./resolve-effective-access.js";

function membershipLoadKey(
  actor: ActorRef,
  organizationId: OrganizationId,
  projectIds: readonly ProjectId[],
): string {
  const sortedProjectIds = [...projectIds]
    .map((id) => id)
    .sort()
    .join("\0");
  return `${actor.userId}\0${organizationId}\0${sortedProjectIds}`;
}

/**
 * Request-scoped membership batch cache (never shared across requests).
 * Deduplicates membership store reads for the same actor, organization, and project ID set.
 */
export class EffectiveAccessRequestCache {
  private readonly membershipLoads = new Map<string, Promise<readonly MembershipRow[]>>();

  async loadMemberships(
    input: LoadMembershipsInput,
    loader: LoadMembershipsFn,
  ): Promise<readonly MembershipRow[]> {
    const key = membershipLoadKey(input.actor, input.organizationId, input.projectIds);
    const existing = this.membershipLoads.get(key);
    if (existing) {
      return existing;
    }
    const pending = loader(input);
    this.membershipLoads.set(key, pending);
    return pending;
  }

  membershipLoadCount(): number {
    return this.membershipLoads.size;
  }
}
