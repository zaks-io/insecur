import {
  AUTHORIZATION_SCOPES,
  BUILT_IN_ROLE_PRESETS,
  MACHINE_UNASSIGNABLE_BUILT_IN_ROLE_PRESETS,
  expandBuiltInRolePresetToScopes,
  isMachineUnassignableBuiltInRolePreset,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const APPROVAL_SCOPES = [
  AUTHORIZATION_SCOPES.approvalApprove,
  AUTHORIZATION_SCOPES.approvalReject,
] as const;

const MUTATION_SCOPES = [
  AUTHORIZATION_SCOPES.onboardingGuidedProvision,
  AUTHORIZATION_SCOPES.secretNonProtectedWrite,
] as const;

const CONFIGURATION_SCOPES = [
  AUTHORIZATION_SCOPES.membershipManage,
  AUTHORIZATION_SCOPES.projectConfigure,
] as const;

const INJECTION_SCOPES = [
  AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
  AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
  AUTHORIZATION_SCOPES.runtimeInjectionRun,
] as const;

const FORBIDDEN_METADATA_VIEWER_SCOPES = [
  ...APPROVAL_SCOPES,
  ...MUTATION_SCOPES,
  ...CONFIGURATION_SCOPES,
  ...INJECTION_SCOPES,
] as const;

describe("BUILT_IN_ROLE_PRESETS", () => {
  it("exports all six V1 built-in role presets", () => {
    expect(Object.values(BUILT_IN_ROLE_PRESETS)).toEqual([
      "owner",
      "admin",
      "developer",
      "metadata-viewer",
      "approval",
      "read-only",
    ]);
  });
});

describe("expandBuiltInRolePresetToScopes", () => {
  it("expands owner with First Value, read, membership, and approval scopes", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.owner);
    expect(scopes).toEqual(
      expect.arrayContaining([
        AUTHORIZATION_SCOPES.onboardingGuidedProvision,
        AUTHORIZATION_SCOPES.membershipManage,
        AUTHORIZATION_SCOPES.approvalApprove,
        AUTHORIZATION_SCOPES.approvalReject,
        AUTHORIZATION_SCOPES.organizationRead,
      ]),
    );
  });

  it("expands admin without approval or guided provisioning scopes", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.admin);
    expect(scopes).toContain(AUTHORIZATION_SCOPES.membershipManage);
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.approvalApprove);
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.approvalReject);
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.onboardingGuidedProvision);
  });

  it("expands developer with project secret and runtime injection scopes only", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.developer);
    expect(scopes).toEqual(
      expect.arrayContaining([
        AUTHORIZATION_SCOPES.secretNonProtectedWrite,
        AUTHORIZATION_SCOPES.runtimeInjectionRun,
        AUTHORIZATION_SCOPES.projectRead,
      ]),
    );
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.membershipManage);
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.organizationRead);
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.approvalApprove);
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.approvalReject);
  });

  it("expands metadata-viewer with scoped metadata detail read only", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.metadataViewer);
    expect(scopes).toEqual([AUTHORIZATION_SCOPES.metadataDetailRead]);
  });

  it("expands approval with approve and reject only", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.approval);
    expect(scopes).toEqual([
      AUTHORIZATION_SCOPES.approvalApprove,
      AUTHORIZATION_SCOPES.approvalReject,
    ]);
  });

  it("expands read-only with metadata read scopes only", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.readOnly);
    expect(scopes).toEqual([
      AUTHORIZATION_SCOPES.organizationRead,
      AUTHORIZATION_SCOPES.projectRead,
      AUTHORIZATION_SCOPES.environmentRead,
      AUTHORIZATION_SCOPES.secretRead,
    ]);
  });
});

describe("built-in role relational invariants", () => {
  it("keeps admin and developer bundles disjoint from approval scopes", () => {
    for (const rolePreset of [BUILT_IN_ROLE_PRESETS.admin, BUILT_IN_ROLE_PRESETS.developer]) {
      const scopes = expandBuiltInRolePresetToScopes(rolePreset);
      for (const approvalScope of APPROVAL_SCOPES) {
        expect(scopes).not.toContain(approvalScope);
      }
    }
  });

  it("keeps metadata-viewer free of mutation, approval, configuration, and injection scopes", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.metadataViewer);
    for (const forbiddenScope of FORBIDDEN_METADATA_VIEWER_SCOPES) {
      expect(scopes).not.toContain(forbiddenScope);
    }
  });

  it("marks metadata-viewer as machine-unassignable", () => {
    expect(MACHINE_UNASSIGNABLE_BUILT_IN_ROLE_PRESETS).toEqual([
      BUILT_IN_ROLE_PRESETS.metadataViewer,
    ]);
    expect(isMachineUnassignableBuiltInRolePreset(BUILT_IN_ROLE_PRESETS.metadataViewer)).toBe(true);
    expect(isMachineUnassignableBuiltInRolePreset(BUILT_IN_ROLE_PRESETS.developer)).toBe(false);
  });
});
