import { describe, expect, it } from "vitest";
import { describeHeuristicHit, findHeuristicSecrets } from "../src/scan/transcripts/heuristics.js";

const FAKE_LEGACY_OPENAI_KEY = "sk-FAKELEGACYOPENAIKEYSENTINELabc123def456";
const FAKE_SCOPED_OPENAI_KEYS = {
  proj: "sk-proj-FAKE_PROJECT_OPENAI_KEY_SENTINEL_abc123",
  svcacct: "sk-svcacct-FAKE_SERVICE_OPENAI_KEY_SENTINEL_abc123",
  admin: "sk-admin-FAKE_ADMIN_OPENAI_KEY_SENTINEL_abc123",
} as const;

function findKnownPrefixHit(text: string, expectedValue: string) {
  const hits = findHeuristicSecrets(text);
  return hits.find(
    (hit) => hit.detectorId === "transcript.heuristic.known_prefix" && hit.value === expectedValue,
  );
}

describe("transcript heuristic known-prefix detection", () => {
  it.each([
    ["legacy", FAKE_LEGACY_OPENAI_KEY],
    ["sk-proj-", FAKE_SCOPED_OPENAI_KEYS.proj],
    ["sk-svcacct-", FAKE_SCOPED_OPENAI_KEYS.svcacct],
    ["sk-admin-", FAKE_SCOPED_OPENAI_KEYS.admin],
  ] as const)("detects OpenAI %s key prefixes in transcript text", (_label, fakeKey) => {
    const hit = findKnownPrefixHit(`assistant pasted ${fakeKey} into the transcript`, fakeKey);
    expect(hit).toBeDefined();
    expect(hit?.confidence).toBe("high");
  });

  it("does not echo full fake key values in heuristic descriptions", () => {
    for (const fakeKey of [FAKE_LEGACY_OPENAI_KEY, ...Object.values(FAKE_SCOPED_OPENAI_KEYS)]) {
      const hit = findKnownPrefixHit(`value ${fakeKey}`, fakeKey);
      expect(hit).toBeDefined();
      if (!hit) {
        continue;
      }
      const description = describeHeuristicHit(hit);
      expect(description.valueShape).not.toContain(fakeKey);
      expect(description.valueFingerprint).not.toContain(fakeKey);
      expect(description.valueFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    }
  });
});
