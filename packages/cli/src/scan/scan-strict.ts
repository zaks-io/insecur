import { EXIT_ACTION_REQUIRED } from "../output/exit-codes.js";
import type { ScanRunResult } from "./runner.js";

function transcriptWarningsAreIncomplete(
  warnings: readonly { readonly code: string }[],
  transcriptsScanned: number,
): boolean {
  return warnings.some(
    (warning) => warning.code !== "transcript.discovery_path_missing" || transcriptsScanned === 0,
  );
}

function projectScanIsIncomplete(result: Extract<ScanRunResult, { mode: "project" }>): boolean {
  const { summary } = result.report;
  return (
    summary.limitReached || summary.unreadableFiles.length > 0 || summary.oversizedFiles.length > 0
  );
}

function agentProjectScanIsIncomplete(
  result: Extract<ScanRunResult, { mode: "agent-projects" }>,
): boolean {
  const { report } = result;
  return (
    transcriptWarningsAreIncomplete(report.warnings, report.summary.transcriptsScanned) ||
    report.summary.limitReached ||
    report.summary.unreadableFiles.length > 0 ||
    report.summary.oversizedFiles.length > 0
  );
}

function transcriptScanIsIncomplete(
  result: Extract<ScanRunResult, { mode: "agent-transcripts" }>,
): boolean {
  const { report } = result;
  return (
    transcriptWarningsAreIncomplete(report.warnings, report.summary.transcriptsScanned) ||
    report.summary.limitReached ||
    report.summary.transcriptsUnreadable > 0 ||
    report.summary.transcriptsOversized > 0
  );
}

function scanNeedsAction(result: ScanRunResult): boolean {
  if (result.mode === "project") {
    return result.report.summary.likelySecrets > 0 || projectScanIsIncomplete(result);
  }
  if (result.mode === "agent-projects") {
    return result.report.summary.likelySecrets > 0 || agentProjectScanIsIncomplete(result);
  }
  return result.report.summary.exposureCount > 0 || transcriptScanIsIncomplete(result);
}

export function scanStrictExitCode(result: ScanRunResult, strict: boolean): number {
  return strict && scanNeedsAction(result) ? EXIT_ACTION_REQUIRED : 0;
}
