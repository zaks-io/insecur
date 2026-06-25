import { ENVIRONMENT_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { EnvironmentLifecycleStoreError } from "../../src/environments/errors.js";
import {
  isEnvironmentLifecycleImmutableViolation,
  rethrowEnvironmentLifecycleDbError,
} from "../../src/environments/rethrow-environment-lifecycle-db-error.js";

describe("rethrowEnvironmentLifecycleDbError", () => {
  it("maps lifecycle immutability trigger violations to lifecycleImmutable", () => {
    const dbError = {
      code: "23514",
      message:
        "lifecycle stage and protected posture cannot change after creation (SQLSTATE 23514)",
    };
    expect(isEnvironmentLifecycleImmutableViolation(dbError)).toBe(true);

    expect(() => rethrowEnvironmentLifecycleDbError(dbError)).toThrow(
      EnvironmentLifecycleStoreError,
    );

    try {
      rethrowEnvironmentLifecycleDbError(dbError);
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentLifecycleStoreError);
      expect((error as EnvironmentLifecycleStoreError).code).toBe(
        ENVIRONMENT_ERROR_CODES.lifecycleImmutable,
      );
    }
  });

  it("rethrows unrelated database errors unchanged", () => {
    const otherError = new Error("connection reset");
    expect(isEnvironmentLifecycleImmutableViolation(otherError)).toBe(false);
    expect(() => rethrowEnvironmentLifecycleDbError(otherError)).toThrow(otherError);
  });
});
