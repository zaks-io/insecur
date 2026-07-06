import { readFile } from "node:fs/promises";
import {
  classifyDotenvFile,
  classifyWholeFileFinding,
  detectSecretFileKind,
  type ClassifiedDotenvEntry,
} from "./classifiers.js";
import { parseDotenvKeys } from "./dotenv-parser.js";
import { mightBeSecretPath } from "./secret-paths.js";
import type { ScanFinding, ScanFindingKind, ScanOptions, ScanReport } from "./types.js";
import { walkProjectFiles, type WalkedFile } from "./walker.js";

interface ReadFileResult {
  readonly content: string | null;
  readonly unreadable: boolean;
}

async function readFileContent(absolutePath: string): Promise<ReadFileResult> {
  try {
    const buffer = await readFile(absolutePath);
    return { content: buffer.toString("utf8"), unreadable: false };
  } catch {
    return { content: null, unreadable: true };
  }
}

function toDotenvFinding(file: string, entry: ClassifiedDotenvEntry): ScanFinding {
  return {
    file,
    key: entry.key,
    kind: "dotenv-entry",
    confidence: entry.confidence,
    migratable: entry.migratable,
    ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
    ...(entry.remediation !== undefined ? { remediation: entry.remediation } : {}),
  };
}

function toWholeFileFinding(file: string, kind: ScanFindingKind): ScanFinding {
  const wholeFile = classifyWholeFileFinding(file, kind);
  return {
    file,
    key: wholeFile.key,
    kind,
    confidence: wholeFile.confidence,
    migratable: wholeFile.migratable,
    ...(wholeFile.reason !== undefined ? { reason: wholeFile.reason } : {}),
    ...(wholeFile.remediation !== undefined ? { remediation: wholeFile.remediation } : {}),
  };
}

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

  const readResult = await readFileContent(file.absolutePath);
  if (readResult.unreadable || readResult.content === null) {
    return { status: "unreadable" };
  }

  const kind = detectSecretFileKind(file.relativePath, readResult.content);
  if (!kind) {
    return { status: "skipped" };
  }

  if (kind === "dotenv-entry") {
    const entries = parseDotenvKeys(readResult.content);
    const classified = classifyDotenvFile(file.relativePath, readResult.content, entries);
    return {
      status: "scanned",
      result: {
        entryCount: entries.length,
        findings: classified.map((entry) => toDotenvFinding(file.relativePath, entry)),
      },
    };
  }

  return {
    status: "scanned",
    result: {
      entryCount: 1,
      findings: [toWholeFileFinding(file.relativePath, kind)],
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

export async function buildScanReport(options: ScanOptions): Promise<ScanReport> {
  const startedAt = performance.now();
  const walkedFiles = await walkProjectFiles(options);
  const findings: ScanFinding[] = [];
  const unreadableFiles: string[] = [];
  const filesWithFindings = new Set<string>();
  const totalEntries = { value: 0 };

  for (const file of walkedFiles) {
    applyScanOutcome(await scanWalkedFile(file), file, {
      findings,
      unreadableFiles,
      totalEntries,
      filesWithFindings,
    });
  }

  const likelySecrets = findings.filter((finding) => finding.confidence === "likely-secret").length;
  const migratableCount = findings.filter((finding) => finding.migratable).length;

  return {
    findings,
    summary: {
      filesScanned: walkedFiles.length,
      filesWithFindings: filesWithFindings.size,
      unreadableFiles,
      totalEntries: totalEntries.value,
      likelySecrets,
      migratableCount,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
  };
}

function formatFindingLines(findings: readonly ScanFinding[]): string[] {
  const lines = ["", "Findings:"];
  for (const finding of findings) {
    const migratableLabel = finding.migratable ? "migratable" : "not migratable";
    lines.push(`  ${finding.file} :: ${finding.key} [${finding.confidence}, ${migratableLabel}]`);
    if (finding.remediation) {
      lines.push(`    remediation: ${finding.remediation}`);
    }
    if (finding.reason) {
      lines.push(`    reason: ${finding.reason}`);
    }
  }
  return lines;
}

function formatUnreadableLines(unreadableFiles: readonly string[]): string[] {
  if (unreadableFiles.length === 0) {
    return [];
  }
  return [
    "",
    `Unreadable files (${String(unreadableFiles.length)}):`,
    ...unreadableFiles.map((file) => `  ${file}`),
  ];
}

export function formatScanHumanReport(report: ScanReport): string {
  const { summary, findings } = report;
  const lines = [
    `Found ${String(summary.likelySecrets)} likely secrets across ${String(summary.filesWithFindings)} files in ${String(summary.elapsedMs)}ms.`,
    "",
    `Files scanned: ${String(summary.filesScanned)} | Entries: ${String(summary.totalEntries)} | Likely secrets: ${String(summary.likelySecrets)} | Migratable: ${String(summary.migratableCount)} | Unreadable: ${String(summary.unreadableFiles.length)}`,
  ];

  lines.push(...formatUnreadableLines(summary.unreadableFiles));

  if (findings.length > 0) {
    lines.push(...formatFindingLines(findings));
  }

  return lines.join("\n");
}

export function formatScanStrictQuietSummary(report: ScanReport): string {
  const { summary } = report;
  return `insecur scan: likely_secrets=${String(summary.likelySecrets)} files=${String(summary.filesWithFindings)} migratable=${String(summary.migratableCount)} unreadable=${String(summary.unreadableFiles.length)} elapsed_ms=${String(summary.elapsedMs)}`;
}
