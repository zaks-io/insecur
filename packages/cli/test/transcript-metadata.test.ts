import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inferTranscriptProvider,
  resolveDiscoveryRoots,
} from "../src/scan/transcripts/metadata.js";

describe("transcript provider inference", () => {
  const homeDir = "/home/agent";
  const roots = resolveDiscoveryRoots(homeDir);

  it("classifies paths directly under each provider root", () => {
    expect(inferTranscriptProvider(join(homeDir, ".cursor", "projects", "x.jsonl"), roots)).toBe(
      "cursor",
    );
    expect(inferTranscriptProvider(join(homeDir, ".claude", "projects", "x.jsonl"), roots)).toBe(
      "claude-code",
    );
    expect(
      inferTranscriptProvider(join(homeDir, ".codex", "sessions", "2026", "x.jsonl"), roots),
    ).toBe("codex");
  });

  it("does not misclassify sibling directories with shared prefixes", () => {
    expect(inferTranscriptProvider(join(homeDir, ".cursor-backup", "x.jsonl"), roots)).toBe(
      "custom",
    );
    expect(inferTranscriptProvider(join(homeDir, ".claude-archive", "x.jsonl"), roots)).toBe(
      "custom",
    );
    expect(inferTranscriptProvider(join(homeDir, ".codex-export", "x.jsonl"), roots)).toBe(
      "custom",
    );
  });
});
