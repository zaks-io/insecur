import {
  AUTHORIZATION_SCOPES,
  BUILT_IN_ROLE_PRESETS,
  MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES,
  MACHINE_UNASSIGNABLE_BUILT_IN_ROLE_PRESETS,
  type AuthorizationScope,
  type BuiltInRolePreset,
  expandBuiltInRolePresetToScopes,
  isMachineUnassignableBuiltInRolePreset,
} from "../src/index.js";
import { CREDENTIAL_SCOPES } from "../src/credential-scopes.js";
import { describe, expect, it } from "vitest";

/** Categories the role-bundle relational invariants quantify over. */
type AuthorizationScopeCategory =
  | "approval"
  | "configuration"
  | "membership"
  | "mutation"
  | "read"
  | "injection"
  | "delivery"
  | "sync";

const RESOURCE_PREFIX_CATEGORIES = {
  approval: "approval",
  runtime_injection: "injection",
  membership: "membership",
} as const satisfies Record<string, AuthorizationScopeCategory>;

/**
 * Atoms whose category is not determined solely by `resource:verb` prefix.
 * @see docs/adr/0034-effective-access-resolver.md
 */
const EXPLICIT_SCOPE_CATEGORIES = {
  [AUTHORIZATION_SCOPES.onboardingGuidedProvision]: "mutation",
  [AUTHORIZATION_SCOPES.secretNonProtectedWrite]: "mutation",
  [AUTHORIZATION_SCOPES.organizationRead]: "read",
  [AUTHORIZATION_SCOPES.projectRead]: "read",
  [AUTHORIZATION_SCOPES.environmentRead]: "read",
  [AUTHORIZATION_SCOPES.secretRead]: "read",
  [AUTHORIZATION_SCOPES.metadataDetailRead]: "read",
  [AUTHORIZATION_SCOPES.projectConfigure]: "configuration",
} as const satisfies Partial<Record<AuthorizationScope, AuthorizationScopeCategory>>;

const ADR_0004_MACHINE_FORBIDDEN_SCOPES = [
  AUTHORIZATION_SCOPES.approvalApprove,
  AUTHORIZATION_SCOPES.approvalReject,
  AUTHORIZATION_SCOPES.membershipManage,
  AUTHORIZATION_SCOPES.projectConfigure,
  AUTHORIZATION_SCOPES.onboardingGuidedProvision,
  AUTHORIZATION_SCOPES.metadataDetailRead,
] as const satisfies readonly AuthorizationScope[];

const METADATA_VIEWER_FORBIDDEN_CATEGORIES = [
  "approval",
  "configuration",
  "delivery",
  "injection",
  "membership",
  "mutation",
  "sync",
] as const satisfies readonly AuthorizationScopeCategory[];

function resourcePrefix(scope: string): string {
  const separatorIndex = scope.indexOf(":");
  return separatorIndex === -1 ? scope : scope.slice(0, separatorIndex);
}

function classifyAuthorizationScope(scope: AuthorizationScope): AuthorizationScopeCategory {
  const explicit = EXPLICIT_SCOPE_CATEGORIES[scope];
  if (explicit) {
    return explicit;
  }

  const prefixCategory =
    RESOURCE_PREFIX_CATEGORIES[resourcePrefix(scope) as keyof typeof RESOURCE_PREFIX_CATEGORIES];
  if (prefixCategory) {
    return prefixCategory;
  }

  throw new Error(`Authorization Scope atom is not classified: ${scope}`);
}

function collectUnclassifiedAuthorizationScopes(
  scopes: Readonly<Record<string, AuthorizationScope>>,
): readonly AuthorizationScope[] {
  const unclassified: AuthorizationScope[] = [];
  for (const scope of Object.values(scopes)) {
    try {
      classifyAuthorizationScope(scope);
    } catch {
      unclassified.push(scope);
    }
  }
  return unclassified;
}

function scopesInCategories(
  scopes: readonly AuthorizationScope[],
  categories: readonly AuthorizationScopeCategory[],
): AuthorizationScope[] {
  const categorySet = new Set(categories);
  const matched: AuthorizationScope[] = [];
  for (const scope of scopes) {
    try {
      if (categorySet.has(classifyAuthorizationScope(scope))) {
        matched.push(scope);
      }
    } catch {
      // Unclassified atoms are reported separately.
    }
  }
  return matched;
}

function setIntersection<T>(left: readonly T[], right: readonly T[]): T[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

interface RoleBundleRegistryConformanceInput {
  authorizationScopes: Readonly<Record<string, AuthorizationScope>>;
  builtInRolePresets: Readonly<Record<string, BuiltInRolePreset>>;
  machineForbiddenScopes: readonly AuthorizationScope[];
  machineUnassignableRolePresets: readonly BuiltInRolePreset[];
  expandRolePreset: (rolePreset: BuiltInRolePreset) => readonly AuthorizationScope[];
  isMachineUnassignableRolePreset: (rolePreset: string) => boolean;
}

function collectRoleBundleRegistryConformanceViolations(
  input: RoleBundleRegistryConformanceInput,
): string[] {
  const violations: string[] = [];

  const unclassifiedScopes = collectUnclassifiedAuthorizationScopes(input.authorizationScopes);
  for (const scope of unclassifiedScopes) {
    violations.push(`authorization scope atom is not classified: ${scope}`);
  }

  const approvalScopes = scopesInCategories(Object.values(input.authorizationScopes), ["approval"]);
  const configurationScopes = scopesInCategories(Object.values(input.authorizationScopes), [
    "configuration",
    "membership",
  ]);

  const ownerScopes = input.expandRolePreset(input.builtInRolePresets.owner);
  for (const approvalScope of approvalScopes) {
    if (!ownerScopes.includes(approvalScope)) {
      violations.push(`owner bundle is missing approval scope ${approvalScope}`);
    }
  }

  for (const rolePreset of [input.builtInRolePresets.admin, input.builtInRolePresets.developer]) {
    const roleScopes = input.expandRolePreset(rolePreset);
    for (const approvalScope of setIntersection(roleScopes, approvalScopes)) {
      violations.push(`${rolePreset} bundle must not include approval scope ${approvalScope}`);
    }
  }

  const approvalRoleScopes = input.expandRolePreset(input.builtInRolePresets.approval);
  for (const forbiddenScope of setIntersection(approvalRoleScopes, configurationScopes)) {
    violations.push(
      `approval bundle must not include configuration or membership scope ${forbiddenScope}`,
    );
  }

  const metadataViewerScopes = input.expandRolePreset(input.builtInRolePresets.metadataViewer);
  for (const forbiddenScope of scopesInCategories(metadataViewerScopes, [
    ...METADATA_VIEWER_FORBIDDEN_CATEGORIES,
  ])) {
    violations.push(`metadata-viewer bundle must not include ${forbiddenScope}`);
  }

  if (!input.machineUnassignableRolePresets.includes(input.builtInRolePresets.metadataViewer)) {
    violations.push("metadata-viewer preset must be machine-unassignable");
  }

  const machineUnassignableSet = new Set(input.machineUnassignableRolePresets);
  for (const rolePreset of Object.values(input.builtInRolePresets)) {
    const expected = machineUnassignableSet.has(rolePreset);
    const actual = input.isMachineUnassignableRolePreset(rolePreset);
    if (actual !== expected) {
      violations.push(
        `isMachineUnassignableBuiltInRolePreset(${rolePreset}) disagrees with MACHINE_UNASSIGNABLE_BUILT_IN_ROLE_PRESETS`,
      );
    }
  }

  const protectedIssuanceScope = input.authorizationScopes.runtimeInjectionGrantIssueProtected;
  for (const rolePreset of Object.values(input.builtInRolePresets)) {
    const roleScopes = input.expandRolePreset(rolePreset);
    if (roleScopes.includes(protectedIssuanceScope)) {
      violations.push(
        `${rolePreset} bundle must not include machine-only scope ${protectedIssuanceScope}`,
      );
    }
  }

  if (input.machineForbiddenScopes.includes(protectedIssuanceScope)) {
    violations.push(
      `machine-forbidden set must not include machine-only scope ${protectedIssuanceScope}`,
    );
  }

  const expectedForbidden = [...ADR_0004_MACHINE_FORBIDDEN_SCOPES].sort();
  const actualForbidden = [...input.machineForbiddenScopes].sort();
  if (actualForbidden.join("|") !== expectedForbidden.join("|")) {
    violations.push(
      `machine-forbidden scopes must match ADR-0004 (expected ${expectedForbidden.join(", ")}, got ${actualForbidden.join(", ")})`,
    );
  }

  if (Object.values(CREDENTIAL_SCOPES).includes(AUTHORIZATION_SCOPES.metadataDetailRead)) {
    violations.push("metadata:detail_read must not appear in CREDENTIAL_SCOPES");
  }

  for (const credentialScope of Object.values(CREDENTIAL_SCOPES)) {
    if (input.machineForbiddenScopes.includes(credentialScope)) {
      violations.push(`credential scope bundle exposes machine-forbidden scope ${credentialScope}`);
    }
  }

  return violations;
}

function liveRegistryConformanceInput(): RoleBundleRegistryConformanceInput {
  return {
    authorizationScopes: AUTHORIZATION_SCOPES,
    builtInRolePresets: BUILT_IN_ROLE_PRESETS,
    machineForbiddenScopes: MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES,
    machineUnassignableRolePresets: MACHINE_UNASSIGNABLE_BUILT_IN_ROLE_PRESETS,
    expandRolePreset: expandBuiltInRolePresetToScopes,
    isMachineUnassignableRolePreset: isMachineUnassignableBuiltInRolePreset,
  };
}

describe("role bundle registry conformance", () => {
  it("classifies every authorization scope atom", () => {
    expect(collectUnclassifiedAuthorizationScopes(AUTHORIZATION_SCOPES)).toEqual([]);
  });

  it("passes all relational invariants on the live registries", () => {
    expect(collectRoleBundleRegistryConformanceViolations(liveRegistryConformanceInput())).toEqual(
      [],
    );
  });

  it("requires the owner bundle to include every approval scope", () => {
    const approvalScopes = scopesInCategories(Object.values(AUTHORIZATION_SCOPES), ["approval"]);
    const ownerScopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.owner);
    expect(approvalScopes.every((scope) => ownerScopes.includes(scope))).toBe(true);
  });

  it("keeps admin and developer bundles disjoint from approval scopes", () => {
    const approvalScopes = scopesInCategories(Object.values(AUTHORIZATION_SCOPES), ["approval"]);
    for (const rolePreset of [BUILT_IN_ROLE_PRESETS.admin, BUILT_IN_ROLE_PRESETS.developer]) {
      expect(setIntersection(expandBuiltInRolePresetToScopes(rolePreset), approvalScopes)).toEqual(
        [],
      );
    }
  });

  it("keeps the approval bundle free of configuration and membership scopes", () => {
    const forbiddenScopes = scopesInCategories(Object.values(AUTHORIZATION_SCOPES), [
      "configuration",
      "membership",
    ]);
    expect(
      setIntersection(
        expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.approval),
        forbiddenScopes,
      ),
    ).toEqual([]);
  });

  it("keeps metadata-viewer narrow and machine-unassignable", () => {
    const metadataViewerScopes = expandBuiltInRolePresetToScopes(
      BUILT_IN_ROLE_PRESETS.metadataViewer,
    );
    expect(
      scopesInCategories(metadataViewerScopes, [...METADATA_VIEWER_FORBIDDEN_CATEGORIES]),
    ).toEqual([]);
    expect(MACHINE_UNASSIGNABLE_BUILT_IN_ROLE_PRESETS).toEqual([
      BUILT_IN_ROLE_PRESETS.metadataViewer,
    ]);
    expect(isMachineUnassignableBuiltInRolePreset(BUILT_IN_ROLE_PRESETS.metadataViewer)).toBe(true);
    expect(isMachineUnassignableBuiltInRolePreset(BUILT_IN_ROLE_PRESETS.developer)).toBe(false);
  });

  it("matches MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES to ADR-0004", () => {
    expect([...MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES].sort()).toEqual(
      [...ADR_0004_MACHINE_FORBIDDEN_SCOPES].sort(),
    );
  });

  it("keeps metadata:detail_read out of machine credential scopes", () => {
    expect(Object.values(CREDENTIAL_SCOPES)).not.toContain(AUTHORIZATION_SCOPES.metadataDetailRead);
    expect(MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES).toContain(
      AUTHORIZATION_SCOPES.metadataDetailRead,
    );
  });

  it("fails closed on an unclassified authorization scope atom", () => {
    const driftedScopes = {
      ...AUTHORIZATION_SCOPES,
      futureAtom: "future:unclassified_atom" as AuthorizationScope,
    };

    expect(collectUnclassifiedAuthorizationScopes(driftedScopes)).toEqual([
      "future:unclassified_atom",
    ]);
    expect(
      collectRoleBundleRegistryConformanceViolations({
        ...liveRegistryConformanceInput(),
        authorizationScopes: driftedScopes,
      }),
    ).toContainEqual("authorization scope atom is not classified: future:unclassified_atom");
  });

  it("fails when machine-only protected issuance is treated as machine-forbidden", () => {
    const violations = collectRoleBundleRegistryConformanceViolations({
      ...liveRegistryConformanceInput(),
      machineForbiddenScopes: [
        ...MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES,
        AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected,
      ],
    });

    expect(violations).toContainEqual(
      `machine-forbidden set must not include machine-only scope ${AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected}`,
    );
  });

  it("fails when a human role bundle includes machine-only protected issuance", () => {
    const violations = collectRoleBundleRegistryConformanceViolations({
      ...liveRegistryConformanceInput(),
      expandRolePreset: (rolePreset) => {
        const scopes = expandBuiltInRolePresetToScopes(rolePreset);
        if (rolePreset === BUILT_IN_ROLE_PRESETS.developer) {
          return [...scopes, AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected];
        }
        return scopes;
      },
    });

    expect(violations).toContainEqual(
      `${BUILT_IN_ROLE_PRESETS.developer} bundle must not include machine-only scope ${AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected}`,
    );
  });

  it("fails when isMachineUnassignableBuiltInRolePreset drifts from the registry array", () => {
    const violations = collectRoleBundleRegistryConformanceViolations({
      ...liveRegistryConformanceInput(),
      isMachineUnassignableRolePreset: (rolePreset) =>
        rolePreset === BUILT_IN_ROLE_PRESETS.developer,
    });

    expect(violations).toContainEqual(
      `isMachineUnassignableBuiltInRolePreset(${BUILT_IN_ROLE_PRESETS.metadataViewer}) disagrees with MACHINE_UNASSIGNABLE_BUILT_IN_ROLE_PRESETS`,
    );
  });
});
