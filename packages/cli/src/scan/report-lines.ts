import { sanitizeScanDisplayPath } from "./scan-display.js";
import type { ScanFinding } from "./types.js";

export function formatScanFindingLines(
  findings: readonly ScanFinding[],
  heading: string,
): string[] {
  if (findings.length === 0) {
    return [];
  }
  const lines = ["", `${heading}:`];
  for (const finding of findings) {
    const migratableLabel = finding.migratable ? "migratable" : "not migratable";
    const safeFile = sanitizeScanDisplayPath(finding.file);
    lines.push(`  ${safeFile} :: ${finding.key} [${finding.confidence}, ${migratableLabel}]`);
    if (finding.remediation) {
      lines.push(`    remediation: ${finding.remediation}`);
    }
    if (finding.reason) {
      lines.push(`    reason: ${finding.reason}`);
    }
  }
  return lines;
}

export function formatPathListLines(heading: string, paths: readonly string[]): string[] {
  if (paths.length === 0) {
    return [];
  }
  return [
    "",
    `${heading} (${String(paths.length)}):`,
    ...paths.map((path) => `  ${sanitizeScanDisplayPath(path)}`),
  ];
}
