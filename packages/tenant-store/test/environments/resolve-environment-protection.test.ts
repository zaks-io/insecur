import { ENVIRONMENT_ERROR_CODES, ENVIRONMENT_LIFECYCLE_STAGES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { EnvironmentLifecycleStoreError } from "../../src/environments/errors.js";
import { resolveEnvironmentProtection } from "../../src/environments/resolve-environment-protection.js";

const CONFIRMING_USER = userId.brand("usr_00000000000000000000000001");

describe("resolveEnvironmentProtection", () => {
  it("marks development as non-protected", () => {
    expect(resolveEnvironmentProtection(ENVIRONMENT_LIFECYCLE_STAGES.development)).toEqual({
      isProtected: false,
      previewNonProductionOptDown: null,
    });
  });

  it("defaults preview to protected without opt-down evidence", () => {
    expect(resolveEnvironmentProtection(ENVIRONMENT_LIFECYCLE_STAGES.preview)).toEqual({
      isProtected: true,
      previewNonProductionOptDown: null,
    });
  });

  it("allows preview opt-down with metadata-safe evidence only", () => {
    const confirmedAt = new Date("2026-06-01T00:00:00.000Z");
    expect(
      resolveEnvironmentProtection(ENVIRONMENT_LIFECYCLE_STAGES.preview, {
        confirmedAt,
        confirmedByUserId: CONFIRMING_USER,
      }),
    ).toEqual({
      isProtected: false,
      previewNonProductionOptDown: {
        confirmedAt,
        confirmedByUserId: CONFIRMING_USER,
      },
    });
  });

  it("requires staging and production to stay protected", () => {
    expect(resolveEnvironmentProtection(ENVIRONMENT_LIFECYCLE_STAGES.staging).isProtected).toBe(
      true,
    );
    expect(resolveEnvironmentProtection(ENVIRONMENT_LIFECYCLE_STAGES.production).isProtected).toBe(
      true,
    );
  });

  it("rejects preview opt-down evidence outside preview", () => {
    expect(() =>
      resolveEnvironmentProtection(ENVIRONMENT_LIFECYCLE_STAGES.development, {
        confirmedAt: new Date(),
        confirmedByUserId: CONFIRMING_USER,
      }),
    ).toThrow(EnvironmentLifecycleStoreError);

    try {
      resolveEnvironmentProtection(ENVIRONMENT_LIFECYCLE_STAGES.development, {
        confirmedAt: new Date(),
        confirmedByUserId: CONFIRMING_USER,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentLifecycleStoreError);
      expect((error as EnvironmentLifecycleStoreError).code).toBe(
        ENVIRONMENT_ERROR_CODES.previewOptDownInvalid,
      );
    }
  });
});
