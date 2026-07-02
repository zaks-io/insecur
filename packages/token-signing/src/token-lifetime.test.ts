import { describe, expect, it } from "vitest";

import {
  isTokenIssuedAtInFuture,
  TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS,
} from "../src/token-lifetime.js";

describe("isTokenIssuedAtInFuture", () => {
  it("accepts iat within the future skew window", () => {
    const now = 1_700_000_000;
    expect(isTokenIssuedAtInFuture(now + TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS, now)).toBe(false);
  });

  it("rejects iat meaningfully in the future", () => {
    const now = 1_700_000_000;
    expect(isTokenIssuedAtInFuture(now + TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS + 1, now)).toBe(true);
  });
});
