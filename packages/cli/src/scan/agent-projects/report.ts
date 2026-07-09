import { sanitizeScanDisplayPath } from "../scan-display.js";
import { formatPathListLines, formatScanFindingLines } from "../report-lines.js";
import type { AgentProjectScanReport, AgentProjectScanWarning } from "./types.js";

function formatWarningLines(warnings: readonly AgentProjectScanWarning[]): string[] {
  if (warnings.length === 0) {
    return [];
  }

  const lines = ["", `Warnings (${String(warnings.length)}):`];
  for (const warning of warnings) {
    const source = warning.sourcePath ? ` ${sanitizeScanDisplayPath(warning.sourcePath)}` : "";
    lines.push(`  ${warning.code}:${source} ${warning.message}`);
  }
  return lines;
}

function formatProjectRootLines(projectRoots: readonly string[]): string[] {
  return formatPathListLines("Agent-touched projects scanned", projectRoots);
}

export function formatAgentProjectScanHumanReport(report: AgentProjectScanReport): string {
  const { summary } = report;
  const lines = [
    `Found ${String(summary.likelySecrets)} likely secrets across ${String(summary.filesWithFindings)} files in agent-touched projects in ${String(summary.elapsedMs)}ms.`,
    "",
    `Projects scanned: ${String(summary.projectsDiscovered)} | Candidate paths: ${String(summary.candidatePaths)} | Transcripts scanned: ${String(summary.transcriptsScanned)} | Files scanned: ${String(summary.filesScanned)} | Entries: ${String(summary.totalEntries)} | Likely secrets: ${String(summary.likelySecrets)} | Migratable: ${String(summary.migratableCount)} | Unreadable: ${String(summary.unreadableFiles.length)} | Oversized: ${String(summary.oversizedFiles.length)} | Limit reached: ${summary.limitReached ? "yes" : "no"}`,
    ...formatWarningLines(report.warnings),
    ...formatProjectRootLines(report.projectRoots),
    ...formatPathListLines("Unreadable files", summary.unreadableFiles),
    ...formatPathListLines("Oversized files", summary.oversizedFiles),
    ...formatScanFindingLines(report.findings, "Agent-readable env findings"),
  ];

  return lines.join("\n");
}

export function formatAgentProjectScanStrictQuietSummary(report: AgentProjectScanReport): string {
  const { summary } = report;
  return `insecur scan --agent-projects: likely_secrets=${String(summary.likelySecrets)} files=${String(summary.filesWithFindings)} projects=${String(summary.projectsDiscovered)} candidate_paths=${String(summary.candidatePaths)} transcripts=${String(summary.transcriptsScanned)} unreadable=${String(summary.unreadableFiles.length)} oversized=${String(summary.oversizedFiles.length)} limit_reached=${summary.limitReached ? "1" : "0"} elapsed_ms=${String(summary.elapsedMs)}`;
}
