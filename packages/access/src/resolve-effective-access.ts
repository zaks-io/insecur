import type { EnvironmentId, OrganizationId, ProjectId, UserId } from "@insecur/domain";
import { EffectiveAccessMemo } from "./effective-access-memo.js";
import { loadActorMemberships, type LoadMembershipsInput } from "./load-memberships.js";
import type { MembershipRow } from "./membership-row.js";
import { unionEffectiveAccessScopes } from "./union-effective-access-scopes.js";

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

export type LoadMembershipsFn = (input: LoadMembershipsInput) => Promise<readonly MembershipRow[]>;

export interface ResolveEffectiveAccessDeps {
  loadMemberships: LoadMembershipsFn;
  memo?: EffectiveAccessMemo;
}

export interface ResolveEffectiveAccessOptions {
  deps?: ResolveEffectiveAccessDeps;
  memo?: EffectiveAccessMemo;
}

const defaultDeps: ResolveEffectiveAccessDeps = {
  loadMemberships: loadActorMemberships,
};

function resolveLoadMemberships(options?: ResolveEffectiveAccessOptions): LoadMembershipsFn {
  return options?.deps?.loadMemberships ?? defaultDeps.loadMemberships;
}

function resolveMemo(options?: ResolveEffectiveAccessOptions): EffectiveAccessMemo | undefined {
  return options?.memo ?? options?.deps?.memo;
}

function resolveDeps(options?: ResolveEffectiveAccessOptions): ResolveEffectiveAccessDeps {
  const loadMemberships = resolveLoadMemberships(options);
  const memo = resolveMemo(options);
  return memo ? { loadMemberships, memo } : { loadMemberships };
}

/**
 * Expands Membership and Role into coordinate-bound Effective Access.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export async function resolveEffectiveAccess(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  options?: ResolveEffectiveAccessOptions,
): Promise<EffectiveAccessResult> {
  const { loadMemberships, memo } = resolveDeps(options);

  if (memo) {
    const cached = memo.get(actor, coordinate);
    if (cached) {
      return cached;
    }
  }

  const loadInput: LoadMembershipsInput = {
    actor,
    organizationId: coordinate.organizationId,
  };
  if (coordinate.projectId !== undefined) {
    loadInput.projectId = coordinate.projectId;
  }

  const memberships = await loadMemberships(loadInput);

  const result: EffectiveAccessResult = {
    organizationId: coordinate.organizationId,
    scopes: unionEffectiveAccessScopes(memberships),
  };

  memo?.set(actor, coordinate, result);
  return result;
}
