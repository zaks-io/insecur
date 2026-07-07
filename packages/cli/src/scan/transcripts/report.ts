import type { TranscriptFinding, TranscriptScanReport } from "./types.js";

function formatNextSteps(steps: readonly string[]): string {
  return steps.join(", ");
}

function formatFindingLine(finding: TranscriptFinding): string[] {
  const lines = [
    `  [${finding.findingKind}] ${finding.provider} :: ${finding.sourcePath}`,
    `    detector=${finding.detectorId} confidence=${finding.confidence} shape=${finding.valueShape} fp=${finding.valueFingerprint}`,
  ];
  if (finding.sessionId) {
    lines.push(`    session=${finding.sessionId}`);
  }
  if (finding.observedAt) {
    lines.push(`    observedAt=${finding.observedAt}`);
  }
  if (finding.candidateKey) {
    lines.push(
      `    candidateKey=${finding.candidateKey} candidateFile=${finding.candidateFile ?? ""}`,
    );
  }
  lines.push(`    nextSteps: ${formatNextSteps(finding.nextSteps)}`);
  return lines;
}

function formatWarningLines(report: TranscriptScanReport): string[] {
  if (report.warnings.length === 0) {
    return [];
  }
  return [
    "",
    `Warnings (${String(report.warnings.length)}):`,
    ...report.warnings.map(
      (warning) =>
        `  ${warning.code}${warning.sourcePath ? ` :: ${warning.sourcePath}` : ""} — ${warning.message}`,
    ),
  ];
}

export function formatTranscriptScanHumanReport(report: TranscriptScanReport): string {
  const { summary, findings } = report;
  const lines = [
    `Found ${String(summary.exposureCount)} transcript exposures (${String(summary.confirmedCount)} confirmed, ${String(summary.heuristicCount)} heuristic) in ${String(summary.elapsedMs)}ms.`,
    "",
    `Transcripts scanned: ${String(summary.transcriptsScanned)} | Candidates: ${String(summary.candidateCount)} | Unreadable: ${String(summary.transcriptsUnreadable)} | Oversized: ${String(summary.transcriptsOversized)} | Limit reached: ${summary.limitReached ? "yes" : "no"}`,
    "",
    "Next steps are suggestions only; insecur does not rotate, delete, or upload transcript data.",
  ];

  lines.push(...formatWarningLines(report));

  if (findings.length > 0) {
    lines.push("", "Findings:");
    for (const finding of findings) {
      lines.push(...formatFindingLine(finding));
    }
  }

  return lines.join("\n");
}

export function formatTranscriptScanStrictQuietSummary(report: TranscriptScanReport): string {
  const { summary } = report;
  return `insecur scan --agent-transcripts: exposures=${String(summary.exposureCount)} confirmed=${String(summary.confirmedCount)} heuristic=${String(summary.heuristicCount)} transcripts=${String(summary.transcriptsScanned)} unreadable=${String(summary.transcriptsUnreadable)} oversized=${String(summary.transcriptsOversized)} limit_reached=${summary.limitReached ? "1" : "0"} elapsed_ms=${String(summary.elapsedMs)}`;
}
