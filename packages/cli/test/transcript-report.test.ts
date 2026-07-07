import { describe, expect, it } from "vitest";
import {
  fingerprintSecretValue,
  formatTranscriptHumanFingerprint,
  createTranscriptReportFingerprintKey,
} from "../src/scan/transcripts/fingerprint.js";
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

describe("transcript human report fingerprint display", () => {
  it("does not print raw SHA-256 digests in human output", () => {
    const rawFingerprint = fingerprintSecretValue(FAKE_SECRET);
    const report = buildReport([
      {
        findingKind: "heuristic_transcript_secret",
        provider: "custom",
        sourcePath: "/tmp/transcript.jsonl",
        detectorId: "transcript.heuristic.known_prefix",
        confidence: "high",
        valueShape: "sk…23 (40 chars)",
        valueFingerprint: rawFingerprint,
        nextSteps: ["rotate_or_revoke"],
      },
    ]);

    const output = formatTranscriptScanHumanReport(report);

    expect(output).not.toContain(rawFingerprint);
    expect(output).not.toContain(FAKE_SECRET);
    expect(output).toMatch(/fp=[0-9a-f]{64}/u);
  });

  it("uses one report key so repeated values correlate within a single human report", () => {
    const rawFingerprint = fingerprintSecretValue(FAKE_SECRET);
    const reportKey = createTranscriptReportFingerprintKey();
    const expected = formatTranscriptHumanFingerprint(rawFingerprint, reportKey);

    expect(formatTranscriptHumanFingerprint(rawFingerprint, reportKey)).toBe(expected);
  });

  it("uses different display fingerprints across separate human report renders", () => {
    const rawFingerprint = fingerprintSecretValue(FAKE_SECRET);
    const report = buildReport([
      {
        findingKind: "heuristic_transcript_secret",
        provider: "custom",
        sourcePath: "/tmp/transcript.jsonl",
        detectorId: "transcript.heuristic.known_prefix",
        confidence: "high",
        valueShape: "sk…23 (40 chars)",
        valueFingerprint: rawFingerprint,
        nextSteps: ["rotate_or_revoke"],
      },
    ]);

    const first = formatTranscriptScanHumanReport(report);
    const second = formatTranscriptScanHumanReport(report);
    const extractFingerprint = (output: string): string | undefined =>
      /fp=([0-9a-f]{64})/u.exec(output)?.[1];

    const firstFingerprint = extractFingerprint(first);
    const secondFingerprint = extractFingerprint(second);
    expect(firstFingerprint).toBeDefined();
    expect(secondFingerprint).toBeDefined();
    expect(firstFingerprint).not.toBe(secondFingerprint);
  });
});
