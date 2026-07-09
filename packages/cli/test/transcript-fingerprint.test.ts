import { describe, expect, it } from "vitest";
import { fingerprintSecretValue } from "../src/scan/transcripts/fingerprint.js";

describe("transcript fingerprint redaction", () => {
  const sentinel = "SENTINEL_TRANSCRIPT_HEURISTIC_ALPHA_3e8b1d";

  it("produces stable fingerprints without echoing the value", () => {
    const fingerprint = fingerprintSecretValue(sentinel);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(fingerprint).not.toContain(sentinel);
  });
});
