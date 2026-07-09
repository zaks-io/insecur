import { buildMachineScanReport } from "./machine-report.js";
import { formatPathListLines, formatScanFindingLines } from "./report-lines.js";
import { scanFileAtPath } from "./scan-file.js";
import { mightBeSecretPath } from "./secret-paths.js";
import type { ScanFinding, ScanOptions, ScanReport, ScanScopeSummary } from "./types.js";
import { walkProjectFiles, type WalkedFile } from "./walker.js";

interface FileScanResult {
  readonly findings: readonly ScanFinding[];
  readonly entryCount: number;
}

type ScanWalkOutcome =
  | { readonly status: "unreadable" }
  | { readonly status: "skipped" }
  | { readonly status: "scanned"; readonly result: FileScanResult };

async function scanWalkedFile(file: WalkedFile): Promise<ScanWalkOutcome> {
  if (!mightBeSecretPath(file.relativePath)) {
    return { status: "skipped" };
  }

  const result = await scanFileAtPath({
    displayPath: file.relativePath,
    absolutePath: file.absolutePath,
    scope: "project",
  });

  if (result.unreadable) {
    return { status: "unreadable" };
  }
  if (result.skipped) {
    return { status: "skipped" };
  }

  return {
    status: "scanned",
    result: {
      entryCount: result.entryCount,
      findings: result.findings,
    },
  };
}

function applyScanOutcome(
  outcome: ScanWalkOutcome,
  file: WalkedFile,
  state: {
    findings: ScanFinding[];
    unreadableFiles: string[];
    totalEntries: { value: number };
    filesWithFindings: Set<string>;
  },
): void {
  if (outcome.status === "unreadable") {
    state.unreadableFiles.push(file.relativePath);
    return;
  }
  if (outcome.status === "skipped") {
    return;
  }

  state.totalEntries.value += outcome.result.entryCount;
  for (const finding of outcome.result.findings) {
    state.filesWithFindings.add(finding.file);
    state.findings.push(finding);
  }
}

function mergeUnreadablePaths(...groups: readonly (readonly string[])[]): readonly string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const path of group) {
      if (!seen.has(path)) {
        seen.add(path);
        merged.push(path);
      }
    }
  }
  return merged;
}

function scopeSummary(findings: readonly ScanFinding[], filesScanned: number): ScanScopeSummary {
  const scoped = findings;
  const filesWithFindings = new Set(scoped.map((finding) => finding.file)).size;
  return {
    filesScanned,
    filesWithFindings,
    likelySecrets: scoped.filter((finding) => finding.confidence === "likely-secret").length,
    migratableCount: scoped.filter((finding) => finding.migratable).length,
  };
}

export async function buildProjectScanReport(options: ScanOptions): Promise<ScanReport> {
  const startedAt = performance.now();
  const {
    files: walkedFiles,
    oversizedFiles,
    unreadablePaths,
    limitReached,
  } = await walkProjectFiles(options);
  const findings: ScanFinding[] = [];
  const scanUnreadableFiles: string[] = [];
  const filesWithFindings = new Set<string>();
  const totalEntries = { value: 0 };

  for (const file of walkedFiles) {
    applyScanOutcome(await scanWalkedFile(file), file, {
      findings,
      unreadableFiles: scanUnreadableFiles,
      totalEntries,
      filesWithFindings,
    });
  }

  const unreadableFiles = mergeUnreadablePaths(unreadablePaths, scanUnreadableFiles);
  const likelySecrets = findings.filter((finding) => finding.confidence === "likely-secret").length;
  const migratableCount = findings.filter((finding) => finding.migratable).length;

  return {
    findings,
    summary: {
      filesScanned: walkedFiles.length,
      filesWithFindings: filesWithFindings.size,
      unreadableFiles,
      oversizedFiles,
      limitReached,
      totalEntries: totalEntries.value,
      likelySecrets,
      migratableCount,
      elapsedMs: Math.round(performance.now() - startedAt),
      project: scopeSummary(findings, walkedFiles.length),
    },
  };
}

export async function buildScanReport(options: ScanOptions): Promise<ScanReport> {
  const projectReport = await buildProjectScanReport(options);

  if (options.machine !== true) {
    return projectReport;
  }

  const machineReport = await buildMachineScanReport({
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
  });

  const findings = [...projectReport.findings, ...machineReport.findings];
  const likelySecrets = findings.filter((finding) => finding.confidence === "likely-secret").length;
  const migratableCount = findings.filter((finding) => finding.migratable).length;
  const filesWithFindings = new Set(findings.map((finding) => finding.file)).size;

  const projectScope =
    projectReport.summary.project ??
    scopeSummary(projectReport.findings, projectReport.summary.filesScanned);

  return {
    findings,
    summary: {
      filesScanned: projectReport.summary.filesScanned + machineReport.summary.filesScanned,
      filesWithFindings,
      unreadableFiles: mergeUnreadablePaths(
        projectReport.summary.unreadableFiles,
        machineReport.summary.unreadableFiles,
      ),
      oversizedFiles: projectReport.summary.oversizedFiles,
      limitReached: projectReport.summary.limitReached,
      totalEntries: projectReport.summary.totalEntries + machineReport.summary.totalEntries,
      likelySecrets,
      migratableCount,
      elapsedMs: projectReport.summary.elapsedMs + machineReport.summary.elapsedMs,
      project: projectScope,
      machine: scopeSummary(machineReport.findings, machineReport.summary.filesScanned),
    },
  };
}

export const SCAN_MIGRATE_ENV_GUIDE_POINTER =
  "To fix: run `insecur guide migrate-env` and follow it, or hand it to your agent.";

function formatMachineScopeBreakdown(summary: ScanReport["summary"]): string[] {
  if (summary.machine === undefined || summary.project === undefined) {
    return [];
  }
  return [
    "",
    `Project: ${String(summary.project.likelySecrets)} likely secrets in ${String(summary.project.filesWithFindings)} files | Machine: ${String(summary.machine.likelySecrets)} likely secrets in ${String(summary.machine.filesWithFindings)} files`,
  ];
}

function formatScopedFindingSections(findings: readonly ScanFinding[]): string[] {
  const lines: string[] = [];
  const projectFindings = findings.filter((finding) => finding.scope === "project");
  const machineFindings = findings.filter((finding) => finding.scope === "machine");
  if (projectFindings.length > 0) {
    lines.push(...formatScanFindingLines(projectFindings, "Project findings"));
  }
  if (machineFindings.length > 0) {
    lines.push(...formatScanFindingLines(machineFindings, "Machine findings"));
  }
  return lines;
}

export function formatScanHumanReport(report: ScanReport): string {
  const { summary, findings } = report;
  const lines = [
    `Found ${String(summary.likelySecrets)} likely secrets across ${String(summary.filesWithFindings)} files in ${String(summary.elapsedMs)}ms.`,
    "",
    `Files scanned: ${String(summary.filesScanned)} | Entries: ${String(summary.totalEntries)} | Likely secrets: ${String(summary.likelySecrets)} | Migratable: ${String(summary.migratableCount)} | Unreadable: ${String(summary.unreadableFiles.length)} | Oversized: ${String(summary.oversizedFiles.length)} | Limit reached: ${summary.limitReached ? "yes" : "no"}`,
    ...formatMachineScopeBreakdown(summary),
    ...formatPathListLines("Unreadable files", summary.unreadableFiles),
    ...formatPathListLines("Oversized files", summary.oversizedFiles),
    ...formatScopedFindingSections(findings),
    "",
    SCAN_MIGRATE_ENV_GUIDE_POINTER,
  ];

  return lines.join("\n");
}

export function formatScanStrictQuietSummary(report: ScanReport): string {
  const { summary } = report;
  const machinePart =
    summary.machine !== undefined && summary.project !== undefined
      ? ` project_likely_secrets=${String(summary.project.likelySecrets)} machine_likely_secrets=${String(summary.machine.likelySecrets)}`
      : "";
  return `insecur scan: likely_secrets=${String(summary.likelySecrets)} files=${String(summary.filesWithFindings)} migratable=${String(summary.migratableCount)} unreadable=${String(summary.unreadableFiles.length)} oversized=${String(summary.oversizedFiles.length)} limit_reached=${summary.limitReached ? "1" : "0"} elapsed_ms=${String(summary.elapsedMs)}${machinePart}`;
}
