import type { EnvironmentId, OrganizationId, ProjectId, UserId } from "@insecur/domain";
import { coordinateCacheKey } from "./coordinate-cache-key.js";
import { EffectiveAccessMemo } from "./effective-access-memo.js";
import { EffectiveAccessRequestCache } from "./effective-access-request-cache.js";
import { filterMembershipsForCoordinate } from "./filter-memberships-for-coordinate.js";
import { loadActorMemberships, type LoadMembershipsInput } from "./load-memberships.js";
import type { MembershipRow } from "./membership-row.js";
import { uniqueProjectIdsFromCoordinates } from "./unique-project-ids.js";
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
  requestCache?: EffectiveAccessRequestCache;
}

export interface ResolveEffectiveAccessOptions {
  deps?: ResolveEffectiveAccessDeps;
  memo?: EffectiveAccessMemo;
  requestCache?: EffectiveAccessRequestCache;
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

function resolveRequestCache(
  options?: ResolveEffectiveAccessOptions,
): EffectiveAccessRequestCache | undefined {
  return options?.requestCache ?? options?.deps?.requestCache;
}

function resolveDeps(options?: ResolveEffectiveAccessOptions): ResolveEffectiveAccessDeps {
  const loadMemberships = resolveLoadMemberships(options);
  const memo = resolveMemo(options);
  const requestCache = resolveRequestCache(options);
  const deps: ResolveEffectiveAccessDeps = { loadMemberships };
  if (memo) {
    deps.memo = memo;
  }
  if (requestCache) {
    deps.requestCache = requestCache;
  }
  return deps;
}

function assertSingleOrganization(coordinates: readonly ResourceCoordinate[]): OrganizationId {
  const organizationId = coordinates[0]?.organizationId;
  if (organizationId === undefined) {
    throw new Error("resolveEffectiveAccessBatch requires at least one coordinate");
  }
  for (const coordinate of coordinates) {
    if (coordinate.organizationId !== organizationId) {
      throw new Error("Effective Access resolves only within one Organization per batch");
    }
  }
  return organizationId;
}

async function loadMembershipsForCoordinates(
  actor: ActorRef,
  coordinates: readonly ResourceCoordinate[],
  deps: ResolveEffectiveAccessDeps,
): Promise<readonly MembershipRow[]> {
  const organizationId = assertSingleOrganization(coordinates);
  const projectIds = uniqueProjectIdsFromCoordinates(coordinates);
  const loadInput: LoadMembershipsInput = { actor, organizationId, projectIds };
  const requestCache = deps.requestCache;
  if (requestCache) {
    return requestCache.loadMemberships(loadInput, deps.loadMemberships);
  }
  return deps.loadMemberships(loadInput);
}

function buildEffectiveAccessResult(
  coordinate: ResourceCoordinate,
  memberships: readonly MembershipRow[],
): EffectiveAccessResult {
  return {
    organizationId: coordinate.organizationId,
    scopes: unionEffectiveAccessScopes(filterMembershipsForCoordinate(memberships, coordinate)),
  };
}

/**
 * Resolves Effective Access for many coordinates in one Organization with one membership read.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export async function resolveEffectiveAccessBatch(
  actor: ActorRef,
  coordinates: readonly ResourceCoordinate[],
  options?: ResolveEffectiveAccessOptions,
): Promise<readonly EffectiveAccessResult[]> {
  if (coordinates.length === 0) {
    return [];
  }

  const deps = resolveDeps(options);
  const memo = deps.memo;
  const uncachedCoordinates = coordinates.filter((coordinate) => !memo?.get(actor, coordinate));

  const computed = new Map<string, EffectiveAccessResult>();
  if (uncachedCoordinates.length > 0) {
    const memberships = await loadMembershipsForCoordinates(actor, uncachedCoordinates, deps);
    for (const coordinate of uncachedCoordinates) {
      const result = buildEffectiveAccessResult(coordinate, memberships);
      computed.set(coordinateCacheKey(coordinate), result);
      memo?.set(actor, coordinate, result);
    }
  }

  return coordinates.map((coordinate) => {
    const fromMemo = memo?.get(actor, coordinate);
    if (fromMemo) {
      return fromMemo;
    }
    const result = computed.get(coordinateCacheKey(coordinate));
    if (!result) {
      return buildEffectiveAccessResult(coordinate, []);
    }
    return result;
  });
}

/**
 * Expands Membership and Role into coordinate-bound Effective Access.
 * Prefer {@link resolveEffectiveAccessBatch} when checking multiple coordinates in one request.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export async function resolveEffectiveAccess(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  options?: ResolveEffectiveAccessOptions,
): Promise<EffectiveAccessResult> {
  const [result] = await resolveEffectiveAccessBatch(actor, [coordinate], options);
  return result ?? buildEffectiveAccessResult(coordinate, []);
}
