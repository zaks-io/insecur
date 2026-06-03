import type { OrganizationId, ProjectId } from "@insecur/domain";
import type { LoadMembershipsInput } from "./load-memberships.js";
import type { LoadMachineMembershipsInput } from "./load-machine-memberships.js";
import type { MachineMembershipRow } from "./machine-membership-row.js";
import type { MembershipRow } from "./membership-row.js";
import type {
  ActorRef,
  LoadMembershipsFn,
  LoadMachineMembershipsFn,
} from "./resolve-effective-access.js";

function actorMembershipLoadKey(actor: ActorRef): string {
  if (actor.type === "user") {
    return actor.userId;
  }
  return [
    actor.machineIdentityId,
    actor.tokenScope.organizationId,
    actor.tokenScope.projectId,
    actor.tokenScope.environmentId ?? "",
    [...actor.credentialScopes].sort().join("\0"),
  ].join("\0");
}

function membershipLoadKey(
  actor: ActorRef,
  organizationId: OrganizationId,
  projectIds: readonly ProjectId[],
): string {
  const sortedProjectIds = [...projectIds]
    .map((id) => id)
    .sort()
    .join("\0");
  return `${actorMembershipLoadKey(actor)}\0${organizationId}\0${sortedProjectIds}`;
}

/**
 * Request-scoped membership batch cache (never shared across requests).
 * Deduplicates membership store reads for the same actor, organization, and project ID set.
 */
export class EffectiveAccessRequestCache {
  private readonly membershipLoads = new Map<string, Promise<readonly MembershipRow[]>>();
  private readonly machineMembershipLoads = new Map<
    string,
    Promise<readonly MachineMembershipRow[]>
  >();

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

  async loadMachineMemberships(
    input: LoadMachineMembershipsInput,
    loader: LoadMachineMembershipsFn,
  ): Promise<readonly MachineMembershipRow[]> {
    const key = membershipLoadKey(input.actor, input.organizationId, input.projectIds);
    const existing = this.machineMembershipLoads.get(key);
    if (existing) {
      return existing;
    }
    const pending = loader(input);
    this.machineMembershipLoads.set(key, pending);
    return pending;
  }

  membershipLoadCount(): number {
    return this.membershipLoads.size + this.machineMembershipLoads.size;
  }
}
