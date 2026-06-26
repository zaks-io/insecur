import { AUTH_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  oidcTrustFailureReasonCode,
  oidcTrustMatchFailure,
} from "../src/oidc-trust-match-failure.js";

describe("oidcTrustMatchFailure helpers", () => {
  it.each([
    ["expired", AUTH_ERROR_CODES.expired],
    ["invalid", AUTH_ERROR_CODES.invalid],
    ["wrong_audience", AUTH_ERROR_CODES.oidcWrongAudience],
    ["wrong_repository", AUTH_ERROR_CODES.oidcWrongRepository],
    ["wrong_environment", AUTH_ERROR_CODES.oidcWrongEnvironment],
    ["untrusted_source", AUTH_ERROR_CODES.oidcUntrustedSource],
  ] as const)("maps %s to the expected auth error code", (reason, reasonCode) => {
    expect(oidcTrustFailureReasonCode(reason)).toBe(reasonCode);
    expect(oidcTrustMatchFailure(reason)).toEqual({
      ok: false,
      reason,
      reasonCode,
    });
  });

  it("includes auth method context on environment mismatches", () => {
    const authMethod = {
      id: "mauth_00000000000000000000000001",
      githubEnvironment: "production",
    } as const;

    expect(oidcTrustMatchFailure("wrong_environment", authMethod as never)).toEqual({
      ok: false,
      reason: "wrong_environment",
      reasonCode: AUTH_ERROR_CODES.oidcWrongEnvironment,
      authMethod,
    });
  });
});
