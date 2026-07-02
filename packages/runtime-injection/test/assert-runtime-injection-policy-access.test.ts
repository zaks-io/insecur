import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { AUTH_ERROR_CODES, environmentId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertRuntimeInjectionPolicyConfigureAccess } from "../src/assert-runtime-injection-policy-access.js";
import { RuntimeInjectionPolicyError } from "../src/runtime-injection-policy-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("assertRuntimeInjectionPolicyConfigureAccess", () => {
  const policyCoordinate = { organizationId: ORG, projectId: PROJECT, environmentId: ENV };

  it("passes when project:configure is present at the environment coordinate", () => {
    expect(() =>
      assertRuntimeInjectionPolicyConfigureAccess(
        policyCoordinate,
        { scopes: [AUTHORIZATION_SCOPES.projectConfigure], organizationId: ORG },
        policyCoordinate,
      ),
    ).not.toThrow();
  });

  it("denies policy configuration without project:configure", () => {
    expect(() =>
      assertRuntimeInjectionPolicyConfigureAccess(
        policyCoordinate,
        { scopes: [AUTHORIZATION_SCOPES.projectRead], organizationId: ORG },
        policyCoordinate,
      ),
    ).toThrow(RuntimeInjectionPolicyError);

    expect(() =>
      assertRuntimeInjectionPolicyConfigureAccess(
        policyCoordinate,
        { scopes: [AUTHORIZATION_SCOPES.projectRead], organizationId: ORG },
        policyCoordinate,
      ),
    ).toThrow(expect.objectContaining({ code: AUTH_ERROR_CODES.insufficientScope }));
  });
});
