import {
  AUTHORIZATION_SCOPES,
  BUILT_IN_ROLE_PRESETS,
  expandBuiltInRolePresetToScopes,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("expandBuiltInRolePresetToScopes", () => {
  it("expands owner with First Value, read, membership, and approval scopes", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.owner);
    expect(scopes).toEqual(
      expect.arrayContaining([
        AUTHORIZATION_SCOPES.onboardingGuidedProvision,
        AUTHORIZATION_SCOPES.membershipManage,
        AUTHORIZATION_SCOPES.approvalApprove,
        AUTHORIZATION_SCOPES.organizationRead,
      ]),
    );
  });

  it("expands admin without approval or guided provisioning scopes", () => {
    const scopes = expandBuiltInRolePresetToScopes(BUILT_IN_ROLE_PRESETS.admin);
    expect(scopes).toContain(AUTHORIZATION_SCOPES.membershipManage);
    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.approvalApprove);
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
