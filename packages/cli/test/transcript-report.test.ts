import { describe, expect, it } from "vitest";
import { formatTranscriptScanHumanReport } from "../src/scan/transcripts/report.js";
import type { TranscriptFinding, TranscriptScanReport } from "../src/scan/transcripts/types.js";

const FAKE_SECRET = "SENTINEL_TRANSCRIPT_REPORT_FAKE_SECRET_abc123";

function buildReport(findings: readonly TranscriptFinding[]): TranscriptScanReport {
  return {
    findings,
    warnings: [],
    summary: {
      transcriptsScanned: 1,
      transcriptsUnreadable: 0,
      transcriptsOversized: 0,
      candidateCount: 0,
      exposureCount: findings.length,
      confirmedCount: findings.filter((finding) => finding.findingKind === "candidate_match")
        .length,
      heuristicCount: findings.filter(
        (finding) => finding.findingKind === "heuristic_transcript_secret",
      ).length,
      limitReached: false,
      elapsedMs: 1,
    },
  };
}

describe("transcript human report finding identifiers", () => {
  it("prints only the metadata-derived finding identifier", () => {
    const report = buildReport([
      {
        findingKind: "heuristic_transcript_secret",
        provider: "custom",
        sourcePath: "/tmp/transcript.jsonl",
        detectorId: "transcript.heuristic.known_prefix",
        confidence: "high",
        findingId: "a".repeat(64),
        nextSteps: ["rotate_or_revoke"],
      },
    ]);

    const output = formatTranscriptScanHumanReport(report);

    expect(output).not.toContain(FAKE_SECRET);
    expect(output).toContain(`finding=${"a".repeat(64)}`);
  });
});
