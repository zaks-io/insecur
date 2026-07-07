import { describe, expect, it } from "vitest";
import { fingerprintSecretValue, redactValueShape } from "../src/scan/transcripts/fingerprint.js";

describe("transcript fingerprint redaction", () => {
  const sentinel = "SENTINEL_TRANSCRIPT_HEURISTIC_ALPHA_3e8b1d";

  it("never includes the full sentinel value in redacted shape output", () => {
    const shape = redactValueShape(sentinel);
    expect(shape).not.toContain(sentinel);
    expect(shape).toContain("…");
    expect(shape).toMatch(/\(\d+ chars\)$/u);
  });

  it("reveals at most two characters per side for longer values", () => {
    const shape = redactValueShape(sentinel);
    const revealed = shape.split("…")[0]?.length ?? 0;
    const suffixPart = shape.split("…")[1]?.split(" ")[0]?.length ?? 0;
    expect(revealed).toBeLessThanOrEqual(2);
    expect(suffixPart).toBeLessThanOrEqual(2);
  });

  it("reveals at most one character per side for short values", () => {
    const shape = redactValueShape("abcdefgh");
    expect(shape).toBe("a…h (8 chars)");
    expect(shape).not.toContain("bcdefg");
  });

  it("returns length-only shape for very short values", () => {
    expect(redactValueShape("ab")).toBe("(2 chars)");
    expect(redactValueShape("abcd")).toBe("(4 chars)");
  });

  it("produces stable fingerprints without echoing the value", () => {
    const fingerprint = fingerprintSecretValue(sentinel);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(fingerprint).not.toContain(sentinel);
  });
});
