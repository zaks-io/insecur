import { AUTHORIZATION_SCOPES, type AuthorizationScope } from "./authorization-scopes.js";

/** Stored membership role preset identifiers (assignment UX only). */
export const BUILT_IN_ROLE_PRESETS = {
  owner: "owner",
  admin: "admin",
  developer: "developer",
  approval: "approval",
  readOnly: "read-only",
} as const;

export type BuiltInRolePreset = (typeof BUILT_IN_ROLE_PRESETS)[keyof typeof BUILT_IN_ROLE_PRESETS];

const FIRST_VALUE_OWNER_SCOPE_BUNDLE: readonly AuthorizationScope[] = [
  AUTHORIZATION_SCOPES.onboardingGuidedProvision,
  AUTHORIZATION_SCOPES.secretNonProtectedWrite,
  AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
  AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
  AUTHORIZATION_SCOPES.runtimeInjectionRun,
];

const BUILT_IN_ROLE_SCOPE_BUNDLES: Record<BuiltInRolePreset, readonly AuthorizationScope[]> = {
  [BUILT_IN_ROLE_PRESETS.owner]: [
    ...FIRST_VALUE_OWNER_SCOPE_BUNDLE,
    AUTHORIZATION_SCOPES.organizationRead,
    AUTHORIZATION_SCOPES.projectRead,
    AUTHORIZATION_SCOPES.environmentRead,
    AUTHORIZATION_SCOPES.secretRead,
    AUTHORIZATION_SCOPES.membershipManage,
    AUTHORIZATION_SCOPES.projectConfigure,
    AUTHORIZATION_SCOPES.approvalApprove,
    AUTHORIZATION_SCOPES.approvalReject,
  ],
  [BUILT_IN_ROLE_PRESETS.admin]: [
    AUTHORIZATION_SCOPES.organizationRead,
    AUTHORIZATION_SCOPES.projectRead,
    AUTHORIZATION_SCOPES.environmentRead,
    AUTHORIZATION_SCOPES.secretRead,
    AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
    AUTHORIZATION_SCOPES.runtimeInjectionRun,
    AUTHORIZATION_SCOPES.membershipManage,
    AUTHORIZATION_SCOPES.projectConfigure,
  ],
  [BUILT_IN_ROLE_PRESETS.developer]: [
    AUTHORIZATION_SCOPES.projectRead,
    AUTHORIZATION_SCOPES.environmentRead,
    AUTHORIZATION_SCOPES.secretRead,
    AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
    AUTHORIZATION_SCOPES.runtimeInjectionRun,
  ],
  [BUILT_IN_ROLE_PRESETS.approval]: [
    AUTHORIZATION_SCOPES.approvalApprove,
    AUTHORIZATION_SCOPES.approvalReject,
  ],
  [BUILT_IN_ROLE_PRESETS.readOnly]: [
    AUTHORIZATION_SCOPES.organizationRead,
    AUTHORIZATION_SCOPES.projectRead,
    AUTHORIZATION_SCOPES.environmentRead,
    AUTHORIZATION_SCOPES.secretRead,
  ],
};

const BUILT_IN_ROLE_PRESET_SET = new Set<string>(Object.values(BUILT_IN_ROLE_PRESETS));

export function isBuiltInRolePreset(value: string): value is BuiltInRolePreset {
  return BUILT_IN_ROLE_PRESET_SET.has(value);
}

/**
 * Expands a Built-In Role preset into Authorization Scopes.
 * Only the Effective Access Resolver may interpret role presets.
 */
export function expandBuiltInRolePresetToScopes(rolePreset: string): readonly AuthorizationScope[] {
  if (!isBuiltInRolePreset(rolePreset)) {
    return [];
  }
  return BUILT_IN_ROLE_SCOPE_BUNDLES[rolePreset];
}
