import { ENVIRONMENT_ERROR_CODES, ENVIRONMENT_LIFECYCLE_STAGES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertEnvironmentAllowsProtectedDraftWrite } from "../src/assert-environment-allows-protected-draft-write.js";
import { SecretWriteError } from "../src/secret-write-error.js";

function protectedEnvironment() {
  return {
    organizationId: "org_a" as never,
    projectId: "prj_a" as never,
    environmentId: "env_a" as never,
    displayName: "Preview" as never,
    lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
    isProtected: true,
    previewNonProductionOptDown: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("assertEnvironmentAllowsProtectedDraftWrite", () => {
  it("allows protected environments", () => {
    expect(() => assertEnvironmentAllowsProtectedDraftWrite(protectedEnvironment())).not.toThrow();
  });

  it("rejects non-protected environments", () => {
    try {
      assertEnvironmentAllowsProtectedDraftWrite({
        ...protectedEnvironment(),
        isProtected: false,
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretWriteError);
      expect((error as SecretWriteError).code).toBe(
        ENVIRONMENT_ERROR_CODES.nonProtectedEnvironment,
      );
    }
  });

  it("rejects missing environment rows", () => {
    try {
      assertEnvironmentAllowsProtectedDraftWrite(null);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretWriteError);
      expect((error as SecretWriteError).code).toBe(ENVIRONMENT_ERROR_CODES.notFound);
    }
  });
});
