export {
  AUTHORIZATION_SCOPES,
  FIRST_VALUE_OWNER_SCOPES,
  type AuthorizationScope,
  isAuthorizationScope,
} from "./authorization-scopes.js";
export {
  BUILT_IN_ROLE_PRESETS,
  type BuiltInRolePreset,
  expandBuiltInRolePresetToScopes,
  isBuiltInRolePreset,
} from "./built-in-role-scopes.js";
export { EffectiveAccessMemo } from "./effective-access-memo.js";
export { EffectiveAccessRequestCache } from "./effective-access-request-cache.js";
export { hasAuthorizationScope } from "./has-authorization-scope.js";
export { loadActorMemberships, type LoadMembershipsInput } from "./load-memberships.js";
export type { MembershipRow } from "./membership-row.js";
export { recordAccessDenial, type RecordAccessDenialInput } from "./record-access-denial.js";
export {
  type ActorRef,
  type EffectiveAccessResult,
  type LoadMembershipsFn,
  type ResolveEffectiveAccessDeps,
  type ResolveEffectiveAccessOptions,
  type ResourceCoordinate,
  resolveEffectiveAccess,
  resolveEffectiveAccessBatch,
} from "./resolve-effective-access.js";
export { unionEffectiveAccessScopes } from "./union-effective-access-scopes.js";
