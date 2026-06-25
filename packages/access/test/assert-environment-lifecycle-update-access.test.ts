import {
  AUTHORIZATION_SCOPES,
  EnvironmentLifecycleAccessError,
  assertEnvironmentLifecycleUpdateAccess,
  type EffectiveAccessResult,
} from "../src/index.js";
import { AUTH_ERROR_CODES, environmentId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

const LIFECYCLE_COORDINATE = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

const ACCESS_COORDINATE = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

function effectiveAccessWithConfigureScope(): EffectiveAccessResult {
  return {
    organizationId: ORG,
    scopes: [AUTHORIZATION_SCOPES.projectConfigure],
  };
}

describe("assertEnvironmentLifecycleUpdateAccess", () => {
  it("accepts project:configure at the environment coordinate", () => {
    expect(() =>
      assertEnvironmentLifecycleUpdateAccess(
        LIFECYCLE_COORDINATE,
        effectiveAccessWithConfigureScope(),
        ACCESS_COORDINATE,
      ),
    ).not.toThrow();
  });

  it("rejects missing evidence", () => {
    expect(() =>
      assertEnvironmentLifecycleUpdateAccess(LIFECYCLE_COORDINATE, undefined, ACCESS_COORDINATE),
    ).toThrow(EnvironmentLifecycleAccessError);
  });

  it("rejects developer read-only scopes", () => {
    const effectiveAccess: EffectiveAccessResult = {
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.environmentRead],
    };

    expect(() =>
      assertEnvironmentLifecycleUpdateAccess(
        LIFECYCLE_COORDINATE,
        effectiveAccess,
        ACCESS_COORDINATE,
      ),
    ).toThrow(EnvironmentLifecycleAccessError);

    try {
      assertEnvironmentLifecycleUpdateAccess(
        LIFECYCLE_COORDINATE,
        effectiveAccess,
        ACCESS_COORDINATE,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentLifecycleAccessError);
      expect((error as EnvironmentLifecycleAccessError).code).toBe(
        AUTH_ERROR_CODES.insufficientScope,
      );
    }
  });
});
