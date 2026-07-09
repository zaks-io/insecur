import { isAbsolute, join } from "node:path";
import { buildProjectScanReport } from "../report.js";
import type { ScanFinding, ScanReport } from "../types.js";

interface ProjectScanTotals {
  readonly findings: ScanFinding[];
  readonly unreadableFiles: string[];
  readonly oversizedFiles: string[];
  filesScanned: number;
  totalEntries: number;
  elapsedMs: number;
  limitReached: boolean;
}

function withAbsoluteFindingPaths(
  rootDir: string,
  findings: readonly ScanFinding[],
): ScanFinding[] {
  return findings.map((finding) => ({
    ...finding,
    file: isAbsolute(finding.file) ? finding.file : join(rootDir, finding.file),
  }));
}

function withAbsolutePaths(rootDir: string, paths: readonly string[]): readonly string[] {
  return paths.map((path) => (isAbsolute(path) ? path : join(rootDir, path)));
}

function emptyTotals(): ProjectScanTotals {
  return {
    findings: [],
    unreadableFiles: [],
    oversizedFiles: [],
    filesScanned: 0,
    totalEntries: 0,
    elapsedMs: 0,
    limitReached: false,
  };
}

function addRootReport(totals: ProjectScanTotals, root: string, report: ScanReport): void {
  totals.findings.push(...withAbsoluteFindingPaths(root, report.findings));
  totals.unreadableFiles.push(...withAbsolutePaths(root, report.summary.unreadableFiles));
  totals.oversizedFiles.push(...withAbsolutePaths(root, report.summary.oversizedFiles));
  totals.filesScanned += report.summary.filesScanned;
  totals.totalEntries += report.summary.totalEntries;
  totals.elapsedMs += report.summary.elapsedMs;
  totals.limitReached ||= report.summary.limitReached;
}

function totalsToReport(totals: ProjectScanTotals): ScanReport {
  const filesWithFindings = new Set(totals.findings.map((finding) => finding.file)).size;
  const likelySecrets = totals.findings.filter(
    (finding) => finding.confidence === "likely-secret",
  ).length;
  const migratableCount = totals.findings.filter((finding) => finding.migratable).length;

  return {
    findings: totals.findings,
    summary: {
      filesScanned: totals.filesScanned,
      filesWithFindings,
      unreadableFiles: totals.unreadableFiles,
      oversizedFiles: totals.oversizedFiles,
      limitReached: totals.limitReached,
      totalEntries: totals.totalEntries,
      likelySecrets,
      migratableCount,
      elapsedMs: totals.elapsedMs,
      project: {
        filesScanned: totals.filesScanned,
        filesWithFindings,
        likelySecrets,
        migratableCount,
      },
    },
  };
}

export async function scanProjectRoots(roots: readonly string[]): Promise<ScanReport> {
  const totals = emptyTotals();

  for (const root of roots) {
    addRootReport(totals, root, await buildProjectScanReport({ rootDir: root }));
  }

  return totalsToReport(totals);
}
