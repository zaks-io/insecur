import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  organizationId,
  projectId,
} from "@insecur/domain";
import { testDisplayName } from "./test-display-name.js";
import type { EnvironmentLifecycleRow } from "@insecur/tenant-store";
import { describe, expect, it } from "vitest";

import { assertEnvironmentAllowsNonProtectedWrite } from "../src/assert-environment-allows-non-protected-write.js";
import { SecretWriteError } from "../src/secret-write-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

function sampleEnvironment(isProtected: boolean): EnvironmentLifecycleRow {
  return {
    environmentId: ENV,
    organizationId: ORG,
    projectId: PROJECT,
    displayName: testDisplayName("Development"),
    lifecycleStage: isProtected
      ? ENVIRONMENT_LIFECYCLE_STAGES.preview
      : ENVIRONMENT_LIFECYCLE_STAGES.development,
    isProtected,
    previewNonProductionOptDown: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
  };
}

describe("assertEnvironmentAllowsNonProtectedWrite", () => {
  it("rejects missing environment rows", () => {
    expect(() => assertEnvironmentAllowsNonProtectedWrite(null)).toThrow(SecretWriteError);
    try {
      assertEnvironmentAllowsNonProtectedWrite(null);
    } catch (error) {
      expect((error as SecretWriteError).code).toBe(ENVIRONMENT_ERROR_CODES.notFound);
    }
  });

  it("rejects protected environments", () => {
    expect(() => assertEnvironmentAllowsNonProtectedWrite(sampleEnvironment(true))).toThrow(
      SecretWriteError,
    );
    try {
      assertEnvironmentAllowsNonProtectedWrite(sampleEnvironment(true));
    } catch (error) {
      expect((error as SecretWriteError).code).toBe(ENVIRONMENT_ERROR_CODES.protectedEnvironment);
    }
  });

  it("allows non-protected environments", () => {
    expect(() => assertEnvironmentAllowsNonProtectedWrite(sampleEnvironment(false))).not.toThrow();
  });
});
