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
export { buildMachineEffectiveAccessScopes } from "./build-machine-effective-access.js";
export {
  CREDENTIAL_SCOPES,
  DEPLOY_AUTOMATION_CREDENTIAL_SCOPE_BUNDLE,
  RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE,
  type CredentialScope,
  isCredentialScope,
} from "./credential-scopes.js";
export { EffectiveAccessMemo } from "./effective-access-memo.js";
export { EffectiveAccessRequestCache } from "./effective-access-request-cache.js";
export { filterMachineMembershipsForCoordinate } from "./filter-machine-memberships-for-coordinate.js";
export { hasAuthorizationScope } from "./has-authorization-scope.js";
export { intersectEffectiveAccessScopes } from "./intersect-effective-access-scopes.js";
export { loadActorMemberships, type LoadMembershipsInput } from "./load-memberships.js";
export {
  loadMachineMemberships,
  type LoadMachineMembershipsInput,
} from "./load-machine-memberships.js";
export {
  MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES,
  filterMachineForbiddenScopes,
  isMachineForbiddenAuthorizationScope,
} from "./machine-forbidden-scopes.js";
export type { MachineMembershipRow } from "./machine-membership-row.js";
export type { MembershipRow } from "./membership-row.js";
export {
  auditAccessDenialOnFailure,
  runWithAccessDenialAudit,
  type AccessDenialAuditOptions,
} from "./assert-access-or-audit.js";
export { recordAccessDenial, type RecordAccessDenialInput } from "./record-access-denial.js";
export {
  type ActorRef,
  type EffectiveAccessResult,
  type LoadMachineMembershipsFn,
  type LoadMembershipsFn,
  type MachineActorRef,
  type ResolveEffectiveAccessDeps,
  type ResourceCoordinate,
  type UserActorRef,
  resolveEffectiveAccess,
  resolveEffectiveAccessBatch,
} from "./resolve-effective-access.js";
export {
  type TokenScope,
  tokenBoundMembershipScopes,
  tokenScopeCoversCoordinate,
} from "./token-scope-boundary.js";
export { unionEffectiveAccessScopes } from "./union-effective-access-scopes.js";
