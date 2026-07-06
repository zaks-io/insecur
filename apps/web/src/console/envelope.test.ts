import { describe, expect, it } from "vitest";
import { isAuthErrorEnvelope, readApiErrorCode } from "./envelope.js";

describe("readApiErrorCode", () => {
  it("reads auth and non-auth error codes from API envelopes", () => {
    expect(readApiErrorCode({ ok: false, error: { code: "auth.required" } })).toBe("auth.required");
    expect(readApiErrorCode({ ok: false, error: { code: "store.runtime_config_missing" } })).toBe(
      "store.runtime_config_missing",
    );
    expect(readApiErrorCode({ ok: true, data: {} })).toBeNull();
    expect(readApiErrorCode(null)).toBeNull();
  });
});

describe("isAuthErrorEnvelope", () => {
  it.each(["auth.required", "auth.expired", "auth.invalid"])(
    "treats %s as an authentication failure",
    (code) => {
      expect(isAuthErrorEnvelope({ ok: false, error: { code } })).toBe(true);
    },
  );

  it("does not treat non-auth API failures as authentication failures", () => {
    expect(
      isAuthErrorEnvelope({ ok: false, error: { code: "store.runtime_config_missing" } }),
    ).toBe(false);
  });
});
