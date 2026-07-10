import type {
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  UserId,
} from "@insecur/domain";
import type { AuthorizationScope } from "./authorization-scopes.js";
import { buildMachineEffectiveAccessScopes } from "./build-machine-effective-access.js";
import { coordinateCacheKey } from "./coordinate-cache-key.js";
import { EffectiveAccessMemo } from "./effective-access-memo.js";
import { EffectiveAccessRequestCache } from "./effective-access-request-cache.js";
import { filterMembershipsForCoordinate } from "./filter-memberships-for-coordinate.js";
import { loadActorMemberships, type LoadMembershipsInput } from "./load-memberships.js";
import {
  loadMachineMemberships,
  type LoadMachineMembershipsInput,
} from "./load-machine-memberships.js";
import type { MachineMembershipRow } from "./machine-membership-row.js";
import type { MembershipRow } from "./membership-row.js";
import type { TokenScope } from "./token-scope-boundary.js";
import { uniqueProjectIdsFromCoordinates } from "./unique-project-ids.js";
import { unionEffectiveAccessScopes } from "./union-effective-access-scopes.js";

export interface UserActorRef {
  type: "user";
  userId: UserId;
  credentialScopes?: readonly string[];
  tokenScope?: {
    organizationId?: OrganizationId;
    projectId?: ProjectId;
    environmentId?: EnvironmentId;
  };
}

export interface MachineActorRef {
  type: "machine";
  machineIdentityId: MachineIdentityId;
  tokenScope: TokenScope;
  credentialScopes: readonly AuthorizationScope[];
}

export type ActorRef = UserActorRef | MachineActorRef;

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
export type LoadMachineMembershipsFn = (
  input: LoadMachineMembershipsInput,
) => Promise<readonly MachineMembershipRow[]>;

export interface ResolveEffectiveAccessDeps {
  loadMemberships?: LoadMembershipsFn;
  loadMachineMemberships?: LoadMachineMembershipsFn;
  memo?: EffectiveAccessMemo;
  requestCache?: EffectiveAccessRequestCache;
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

function isUserActor(actor: ActorRef): actor is UserActorRef {
  return actor.type === "user";
}

async function loadMembershipsForCoordinates(
  actor: UserActorRef,
  coordinates: readonly ResourceCoordinate[],
  deps?: ResolveEffectiveAccessDeps,
): Promise<readonly MembershipRow[]> {
  const organizationId = assertSingleOrganization(coordinates);
  const projectIds = uniqueProjectIdsFromCoordinates(coordinates);
  const loadInput: LoadMembershipsInput = { actor, organizationId, projectIds };
  const loadMemberships = deps?.loadMemberships ?? loadActorMemberships;
  const requestCache = deps?.requestCache;
  if (requestCache) {
    return requestCache.loadMemberships(loadInput, loadMemberships);
  }
  return loadMemberships(loadInput);
}

async function loadMachineMembershipsForCoordinates(
  actor: MachineActorRef,
  coordinates: readonly ResourceCoordinate[],
  deps?: ResolveEffectiveAccessDeps,
): Promise<readonly MachineMembershipRow[]> {
  const organizationId = assertSingleOrganization(coordinates);
  const projectIds = uniqueProjectIdsFromCoordinates(coordinates);
  const loadInput: LoadMachineMembershipsInput = { actor, organizationId, projectIds };
  const loadMachineMembershipsFn = deps?.loadMachineMemberships ?? loadMachineMemberships;
  const requestCache = deps?.requestCache;
  if (requestCache) {
    return requestCache.loadMachineMemberships(loadInput, loadMachineMembershipsFn);
  }
  return loadMachineMembershipsFn(loadInput);
}

function buildUserEffectiveAccessResult(
  actor: UserActorRef,
  coordinate: ResourceCoordinate,
  memberships: readonly MembershipRow[],
): EffectiveAccessResult {
  const insideBoundary = isInsideUserTokenBoundary(actor, coordinate);
  const membershipScopes = insideBoundary
    ? unionEffectiveAccessScopes(filterMembershipsForCoordinate(memberships, coordinate))
    : [];
  const scopes = intersectCredentialScopes(membershipScopes, actor.credentialScopes);
  return {
    organizationId: coordinate.organizationId,
    scopes,
  };
}

function isWithinOptionalBoundary<T>(expected: T | undefined, actual: T | undefined): boolean {
  return expected === undefined || expected === actual;
}

function isInsideUserTokenBoundary(actor: UserActorRef, coordinate: ResourceCoordinate): boolean {
  return (
    isWithinOptionalBoundary(actor.tokenScope?.organizationId, coordinate.organizationId) &&
    isWithinOptionalBoundary(actor.tokenScope?.projectId, coordinate.projectId) &&
    isWithinOptionalBoundary(actor.tokenScope?.environmentId, coordinate.environmentId)
  );
}

function intersectCredentialScopes(
  membershipScopes: readonly string[],
  credentialScopes: readonly string[] | undefined,
): readonly string[] {
  if (credentialScopes === undefined) {
    return membershipScopes;
  }
  return membershipScopes.filter((scope) => credentialScopes.includes(scope));
}

function buildMachineEffectiveAccessResult(
  actor: MachineActorRef,
  coordinate: ResourceCoordinate,
  memberships: readonly MachineMembershipRow[],
): EffectiveAccessResult {
  return {
    organizationId: coordinate.organizationId,
    scopes: buildMachineEffectiveAccessScopes(actor, coordinate, memberships),
  };
}

function buildEmptyEffectiveAccessResult(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
): EffectiveAccessResult {
  if (isUserActor(actor)) {
    return buildUserEffectiveAccessResult(actor, coordinate, []);
  }
  return buildMachineEffectiveAccessResult(actor, coordinate, []);
}

async function computeUserEffectiveAccess(
  actor: UserActorRef,
  uncachedCoordinates: readonly ResourceCoordinate[],
  deps: ResolveEffectiveAccessDeps | undefined,
  memo: EffectiveAccessMemo | undefined,
): Promise<Map<string, EffectiveAccessResult>> {
  const computed = new Map<string, EffectiveAccessResult>();
  const memberships = await loadMembershipsForCoordinates(actor, uncachedCoordinates, deps);
  for (const coordinate of uncachedCoordinates) {
    const result = buildUserEffectiveAccessResult(actor, coordinate, memberships);
    computed.set(coordinateCacheKey(coordinate), result);
    memo?.set(actor, coordinate, result);
  }
  return computed;
}

async function computeMachineEffectiveAccess(
  actor: MachineActorRef,
  uncachedCoordinates: readonly ResourceCoordinate[],
  deps: ResolveEffectiveAccessDeps | undefined,
  memo: EffectiveAccessMemo | undefined,
): Promise<Map<string, EffectiveAccessResult>> {
  const computed = new Map<string, EffectiveAccessResult>();
  const memberships = await loadMachineMembershipsForCoordinates(actor, uncachedCoordinates, deps);
  for (const coordinate of uncachedCoordinates) {
    const result = buildMachineEffectiveAccessResult(actor, coordinate, memberships);
    computed.set(coordinateCacheKey(coordinate), result);
    memo?.set(actor, coordinate, result);
  }
  return computed;
}

async function computeUncachedEffectiveAccess(
  actor: ActorRef,
  uncachedCoordinates: readonly ResourceCoordinate[],
  deps: ResolveEffectiveAccessDeps | undefined,
  memo: EffectiveAccessMemo | undefined,
): Promise<Map<string, EffectiveAccessResult>> {
  if (uncachedCoordinates.length === 0) {
    return new Map();
  }
  if (isUserActor(actor)) {
    return computeUserEffectiveAccess(actor, uncachedCoordinates, deps, memo);
  }
  return computeMachineEffectiveAccess(actor, uncachedCoordinates, deps, memo);
}

function resolveCoordinateFromBatch(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  memo: EffectiveAccessMemo | undefined,
  computed: Map<string, EffectiveAccessResult>,
): EffectiveAccessResult {
  const fromMemo = memo?.get(actor, coordinate);
  if (fromMemo) {
    return fromMemo;
  }
  return (
    computed.get(coordinateCacheKey(coordinate)) ??
    buildEmptyEffectiveAccessResult(actor, coordinate)
  );
}

/**
 * Resolves Effective Access for many coordinates in one Organization with one membership read.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export async function resolveEffectiveAccessBatch(
  actor: ActorRef,
  coordinates: readonly ResourceCoordinate[],
  deps?: ResolveEffectiveAccessDeps,
): Promise<readonly EffectiveAccessResult[]> {
  if (coordinates.length === 0) {
    return [];
  }

  const memo = deps?.memo;
  const uncachedCoordinates = coordinates.filter((coordinate) => !memo?.get(actor, coordinate));
  const computed = await computeUncachedEffectiveAccess(actor, uncachedCoordinates, deps, memo);

  return coordinates.map((coordinate) =>
    resolveCoordinateFromBatch(actor, coordinate, memo, computed),
  );
}

/**
 * Expands Membership and Role into coordinate-bound Effective Access.
 * Prefer {@link resolveEffectiveAccessBatch} when checking multiple coordinates in one request.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export async function resolveEffectiveAccess(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  deps?: ResolveEffectiveAccessDeps,
): Promise<EffectiveAccessResult> {
  const [result] = await resolveEffectiveAccessBatch(actor, [coordinate], deps);
  if (result !== undefined) {
    return result;
  }
  return buildEmptyEffectiveAccessResult(actor, coordinate);
}
