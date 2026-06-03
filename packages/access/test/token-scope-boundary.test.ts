import {
  tokenBoundMembershipScopes,
  tokenScopeCoversCoordinate,
  type TokenScope,
} from "../src/token-scope-boundary.js";
import { AUTHORIZATION_SCOPES } from "../src/authorization-scopes.js";
import { environmentId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const PROJECT_B = projectId.brand("prj_00000000000000000000000002");
const ENV_A = environmentId.brand("env_00000000000000000000000001");
const ENV_B = environmentId.brand("env_00000000000000000000000002");

describe("tokenScopeCoversCoordinate", () => {
  const tokenScope: TokenScope = {
    organizationId: ORG,
    projectId: PROJECT_A,
    environmentId: ENV_A,
  };

  it("accepts matching organization, project, and environment coordinates", () => {
    expect(
      tokenScopeCoversCoordinate(tokenScope, {
        organizationId: ORG,
        projectId: PROJECT_A,
        environmentId: ENV_A,
      }),
    ).toBe(true);
  });

  it("rejects cross-organization and cross-project coordinates", () => {
    expect(
      tokenScopeCoversCoordinate(tokenScope, {
        organizationId: organizationId.brand("org_00000000000000000000000099"),
        projectId: PROJECT_A,
      }),
    ).toBe(false);

    expect(
      tokenScopeCoversCoordinate(tokenScope, {
        organizationId: ORG,
        projectId: PROJECT_B,
      }),
    ).toBe(false);
  });

  it("rejects environment mismatches when token scope is environment-bound", () => {
    expect(
      tokenScopeCoversCoordinate(tokenScope, {
        organizationId: ORG,
        projectId: PROJECT_A,
        environmentId: ENV_B,
      }),
    ).toBe(false);
  });
});

describe("tokenBoundMembershipScopes", () => {
  const membershipScopes = [AUTHORIZATION_SCOPES.runtimeInjectionRun] as const;

  it("returns membership scopes when token scope covers the coordinate", () => {
    expect(
      tokenBoundMembershipScopes(
        membershipScopes,
        { organizationId: ORG, projectId: PROJECT_A },
        { organizationId: ORG, projectId: PROJECT_A },
      ),
    ).toEqual([AUTHORIZATION_SCOPES.runtimeInjectionRun]);
  });

  it("returns empty scopes when token scope does not cover the coordinate", () => {
    expect(
      tokenBoundMembershipScopes(
        membershipScopes,
        { organizationId: ORG, projectId: PROJECT_A },
        { organizationId: ORG, projectId: PROJECT_B },
      ),
    ).toEqual([]);
  });
});
