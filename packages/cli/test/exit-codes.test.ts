import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES, ONBOARDING_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  EXIT_AUTH_REQUIRED,
  EXIT_CONFLICT,
  EXIT_FORBIDDEN,
  EXIT_STEP_UP,
  EXIT_UNEXPECTED,
  EXIT_VALIDATION,
  exitCodeForErrorCode,
} from "../src/output/exit-codes.js";

describe("exitCodeForErrorCode", () => {
  it("maps known auth and onboarding codes", () => {
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.insufficientScope)).toBe(EXIT_FORBIDDEN);
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.highAssuranceRequired)).toBe(EXIT_STEP_UP);
    expect(exitCodeForErrorCode(ONBOARDING_ERROR_CODES.alreadyProvisioned)).toBe(EXIT_CONFLICT);
    expect(exitCodeForErrorCode("operation.idempotency_mismatch")).toBe(EXIT_CONFLICT);
    expect(exitCodeForErrorCode(VALIDATION_ERROR_CODES.invalidDisplayName)).toBe(EXIT_VALIDATION);
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.expired)).toBe(EXIT_AUTH_REQUIRED);
    expect(exitCodeForErrorCode("unknown.error")).toBe(EXIT_UNEXPECTED);
  });
});
