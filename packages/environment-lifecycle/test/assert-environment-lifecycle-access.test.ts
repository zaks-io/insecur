import { type EffectiveAccessResult } from "@insecur/access";
import { AUTH_ERROR_CODES, environmentId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  assertEnvironmentLifecycleConfigureAccess,
  assertEnvironmentLifecycleReadAccess,
} from "../src/assert-environment-lifecycle-access.js";
import { EnvironmentLifecycleError } from "../src/environment-lifecycle-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

const coordinate = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

const ownerAccess: EffectiveAccessResult = {
  organizationId: ORG,
  scopes: ["organization:read", "project:read", "environment:read", "project:configure"],
};

describe("assertEnvironmentLifecycleReadAccess", () => {
  it("accepts environment read scope at the environment coordinate", () => {
    expect(() => {
      assertEnvironmentLifecycleReadAccess(coordinate, ownerAccess, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      });
    }).not.toThrow();
  });

  it("rejects missing environment read scope", () => {
    expect(() => {
      assertEnvironmentLifecycleReadAccess(
        coordinate,
        { organizationId: ORG, scopes: ["project:read"] },
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      );
    }).toThrow(EnvironmentLifecycleError);
  });
});

describe("assertEnvironmentLifecycleConfigureAccess", () => {
  it("requires project configure scope", () => {
    expect(() => {
      assertEnvironmentLifecycleConfigureAccess(
        coordinate,
        { organizationId: ORG, scopes: ["environment:read", "project:read"] },
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      );
    }).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });
});
