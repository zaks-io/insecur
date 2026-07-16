import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  STORE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import {
  EXIT_ACTION_REQUIRED,
  EXIT_AUTH_REQUIRED,
  EXIT_CONFLICT,
  EXIT_FORBIDDEN,
  EXIT_STEP_UP,
  EXIT_UNEXPECTED,
  EXIT_VALIDATION,
  exitCodeForErrorCode,
} from "../src/output/exit-codes.js";

describe("exitCodeForErrorCode", () => {
  it("exports action-required exit code for scan --strict", () => {
    expect(EXIT_ACTION_REQUIRED).toBe(7);
  });

  it("maps known auth and onboarding codes", () => {
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.insufficientScope)).toBe(EXIT_FORBIDDEN);
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.highAssuranceRequired)).toBe(EXIT_STEP_UP);
    expect(exitCodeForErrorCode(ONBOARDING_ERROR_CODES.alreadyProvisioned)).toBe(EXIT_CONFLICT);
    expect(exitCodeForErrorCode("operation.idempotency_mismatch")).toBe(EXIT_CONFLICT);
    expect(exitCodeForErrorCode(VALIDATION_ERROR_CODES.invalidDisplayName)).toBe(EXIT_VALIDATION);
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.expired)).toBe(EXIT_AUTH_REQUIRED);
    expect(exitCodeForErrorCode("unknown.error")).toBe(EXIT_UNEXPECTED);
  });

  it("downgrades a retryable-by-default code to unexpected when the occurrence is non-retryable", () => {
    // A mid-flight connection loss surfaces store.unavailable with retryable:false; the exit code
    // must not tell an exit-code-driven retry loop to re-run a possibly-committed write.
    expect(exitCodeForErrorCode(STORE_ERROR_CODES.unavailable)).toBe(8);
    expect(exitCodeForErrorCode(STORE_ERROR_CODES.unavailable, true)).toBe(8);
    expect(exitCodeForErrorCode(STORE_ERROR_CODES.unavailable, false)).toBe(EXIT_UNEXPECTED);
  });
});
