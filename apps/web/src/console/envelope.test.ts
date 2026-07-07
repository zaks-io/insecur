import { describe, expect, it } from "vitest";
import { isAuthErrorEnvelope, parseConsoleReadEnvelope, readApiErrorCode } from "./envelope.js";
import { parseOrgProjectsBody } from "./projects.js";

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

describe("parseConsoleReadEnvelope", () => {
  it("maps non-auth structured error envelopes to unavailable", () => {
    const body = { ok: false, error: { code: "store.runtime_config_missing" } };

    expect(parseConsoleReadEnvelope(body, parseOrgProjectsBody)).toEqual({ kind: "unavailable" });
  });

  it("keeps auth error envelopes denied and success envelopes ok", () => {
    expect(
      parseConsoleReadEnvelope(
        { ok: false, error: { code: "auth.required" } },
        parseOrgProjectsBody,
      ),
    ).toEqual({ kind: "denied" });
    expect(
      parseConsoleReadEnvelope({ ok: true, data: { projects: [] } }, parseOrgProjectsBody),
    ).toEqual({
      kind: "ok",
      value: [],
    });
    expect(parseConsoleReadEnvelope({ not: "an envelope" }, parseOrgProjectsBody)).toEqual({
      kind: "denied",
    });
  });
});
