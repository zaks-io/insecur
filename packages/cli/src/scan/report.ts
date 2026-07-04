import { readFile } from "node:fs/promises";
import {
  classifyDotenvFile,
  classifyWholeFileFinding,
  detectSecretFileKind,
  type ClassifiedDotenvEntry,
} from "./classifiers.js";
import { parseDotenvKeys } from "./dotenv-parser.js";
import { isDotenvPath, mightBeSecretPath } from "./secret-paths.js";
import type { ScanFinding, ScanFindingKind, ScanOptions, ScanReport } from "./types.js";
import { walkProjectFiles, type WalkedFile } from "./walker.js";

const CONTENT_HEAD_BYTES = 512;

async function readFileContent(absolutePath: string, relativePath: string): Promise<string | null> {
  try {
    const buffer = await readFile(absolutePath);
    if (isDotenvPath(relativePath)) {
      return buffer.toString("utf8");
    }
    return buffer.toString("utf8", 0, Math.min(buffer.length, CONTENT_HEAD_BYTES));
  } catch {
    return null;
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

async function scanWalkedFile(file: WalkedFile): Promise<FileScanResult | null> {
  if (!mightBeSecretPath(file.relativePath)) {
    return null;
  }

  const content = await readFileContent(file.absolutePath, file.relativePath);
  if (content === null) {
    return null;
  }

  const kind = detectSecretFileKind(file.relativePath, content);
  if (!kind) {
    return null;
  }

  if (kind === "dotenv-entry") {
    const entries = parseDotenvKeys(content);
    const classified = classifyDotenvFile(file.relativePath, content, entries);
    return {
      entryCount: entries.length,
      findings: classified.map((entry) => toDotenvFinding(file.relativePath, entry)),
    };
  }

  return {
    entryCount: 1,
    findings: [toWholeFileFinding(file.relativePath, kind)],
  };
}

export async function buildScanReport(options: ScanOptions): Promise<ScanReport> {
  const startedAt = performance.now();
  const walkedFiles = await walkProjectFiles(options);
  const findings: ScanFinding[] = [];
  let totalEntries = 0;
  const filesWithFindings = new Set<string>();

  for (const file of walkedFiles) {
    const result = await scanWalkedFile(file);
    if (!result) continue;

    totalEntries += result.entryCount;
    for (const finding of result.findings) {
      filesWithFindings.add(finding.file);
      findings.push(finding);
    }
  }

  const likelySecrets = findings.filter((finding) => finding.confidence === "likely-secret").length;
  const migratableCount = findings.filter((finding) => finding.migratable).length;

  return {
    findings,
    summary: {
      filesScanned: walkedFiles.length,
      filesWithFindings: filesWithFindings.size,
      totalEntries,
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

export function formatScanHumanReport(report: ScanReport): string {
  const { summary, findings } = report;
  const lines = [
    `Found ${String(summary.likelySecrets)} likely secrets across ${String(summary.filesWithFindings)} files in ${String(summary.elapsedMs)}ms. That's how long an agent would need.`,
    "",
    `Files scanned: ${String(summary.filesScanned)} | Entries: ${String(summary.totalEntries)} | Likely secrets: ${String(summary.likelySecrets)} | Migratable: ${String(summary.migratableCount)}`,
  ];

  if (findings.length > 0) {
    lines.push(...formatFindingLines(findings));
  }

  return lines.join("\n");
}

export function formatScanStrictQuietSummary(report: ScanReport): string {
  const { summary } = report;
  return `insecur scan: likely_secrets=${String(summary.likelySecrets)} files=${String(summary.filesWithFindings)} migratable=${String(summary.migratableCount)} elapsed_ms=${String(summary.elapsedMs)}`;
}
