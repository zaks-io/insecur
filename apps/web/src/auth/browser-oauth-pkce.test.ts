import { describe, expect, it } from "vitest";
import {
  decodePkceRoundTrip,
  encodePkceRoundTrip,
  normalizeReturnTo,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";

const DEFAULT_RETURN_TO = "/whoami";

function roundTripWithReturnTo(returnTo: string): PkceRoundTrip {
  return { state: "state_pkce_test", codeVerifier: "verifier_pkce_test", returnTo };
}

describe("normalizeReturnTo", () => {
  it("documents the WHATWG bypass: /\\evil.com resolves cross-origin from a Location header", () => {
    expect(new URL("/\\evil.com", "https://app.example").origin).toBe("https://evil.com");
  });

  it.each(["/\\evil.com", "/\\\\evil.com", "\\/evil.com", "\\\\evil.com"])(
    "rejects backslash variant %j and falls back to the default landing path",
    (value) => {
      expect(normalizeReturnTo(value, DEFAULT_RETURN_TO)).toBe(DEFAULT_RETURN_TO);
    },
  );

  it("rejects encoded %5C variants once query decoding has run", () => {
    const decoded = new URL("https://app.example/login?returnTo=%2F%5Cevil.com").searchParams.get(
      "returnTo",
    );
    expect(decoded).toBe("/\\evil.com");
    expect(normalizeReturnTo(decoded, DEFAULT_RETURN_TO)).toBe(DEFAULT_RETURN_TO);
  });

  it("rejects backslashes anywhere in the path, not just the prefix", () => {
    expect(normalizeReturnTo("/orgs\\evil.com", DEFAULT_RETURN_TO)).toBe(DEFAULT_RETURN_TO);
  });

  it.each(["/\t/evil.com", "/\n/evil.com", "/\r/evil.com"])(
    "rejects %j, which the WHATWG parser would resolve cross-origin by stripping the control char",
    (value) => {
      expect(new URL(value, "https://app.example").origin).toBe("https://evil.com");
      expect(normalizeReturnTo(value, DEFAULT_RETURN_TO)).toBe(DEFAULT_RETURN_TO);
    },
  );

  it.each(["//evil.com", "https://evil.com/x", "evil.com", "", null])(
    "rejects non-relative value %j",
    (value) => {
      expect(normalizeReturnTo(value, DEFAULT_RETURN_TO)).toBe(DEFAULT_RETURN_TO);
    },
  );

  it.each(["/", "/orgs/org_01/audit", "/orgs/org_01?x=1", "/orgs/org_01?x=1&y=2#frag"])(
    "accepts legitimate app path %j unchanged",
    (value) => {
      expect(normalizeReturnTo(value, DEFAULT_RETURN_TO)).toBe(value);
    },
  );
});

describe("decodePkceRoundTrip returnTo validation", () => {
  it("round-trips a legitimate returnTo with a query string", () => {
    const roundTrip = roundTripWithReturnTo("/orgs/org_01?x=1");
    expect(decodePkceRoundTrip(encodePkceRoundTrip(roundTrip))).toEqual(roundTrip);
  });

  it.each(["/\\evil.com", "/\\\\evil.com", "//evil.com", "https://evil.com/x"])(
    "rejects a payload whose returnTo is %j",
    (returnTo) => {
      expect(decodePkceRoundTrip(encodePkceRoundTrip(roundTripWithReturnTo(returnTo)))).toBeNull();
    },
  );
});
