import { getStyle } from "../output/style.js";
import { sanitizeScanDisplayPath } from "./scan-display.js";
import type { ScanFinding } from "./types.js";

// Color is applied ONLY to trusted, enum-derived literals (the heading, the
// confidence word, the bracketed tag, the leading glyph). Untrusted content
// (finding.file, finding.key, remediation/reason prose) is sanitized first via
// sanitizeScanDisplayPath and then emitted WITHOUT a surrounding style span, so
// no ANSI can be injected between an opening and closing SGR. Sanitize first,
// then optionally wrap the already-sanitized value; never wrap raw input.

function confidenceRole(confidence: ScanFinding["confidence"]): (value: string) => string {
  const s = getStyle();
  return confidence === "likely-secret" ? s.warn : s.meta;
}

function findingLine(finding: ScanFinding): string {
  const s = getStyle();
  const marker =
    finding.confidence === "likely-secret" ? s.warn(s.glyph("warn")) : s.meta(s.glyph("bullet"));
  const migratableLabel = finding.migratable ? "migratable" : "not migratable";
  const safeFile = sanitizeScanDisplayPath(finding.file);
  const safeKey = sanitizeScanDisplayPath(finding.key);
  const tag = `${s.meta("[")}${confidenceRole(finding.confidence)(finding.confidence)}${s.meta(`, ${migratableLabel}]`)}`;
  return `  ${marker} ${safeFile} ${s.meta("::")} ${safeKey} ${tag}`;
}

export function formatScanFindingLines(
  findings: readonly ScanFinding[],
  heading: string,
): string[] {
  if (findings.length === 0) {
    return [];
  }
  const s = getStyle();
  const lines = ["", s.meta(`${heading} ${s.glyph("bullet")} ${String(findings.length)}`)];
  for (const finding of findings) {
    lines.push(findingLine(finding));
    if (finding.remediation) {
      lines.push(`    ${s.meta("remediation:")} ${sanitizeScanDisplayPath(finding.remediation)}`);
    }
    if (finding.reason) {
      lines.push(`    ${s.meta("reason:")} ${sanitizeScanDisplayPath(finding.reason)}`);
    }
  }
  return lines;
}

export function formatPathListLines(heading: string, paths: readonly string[]): string[] {
  if (paths.length === 0) {
    return [];
  }
  const s = getStyle();
  return [
    "",
    s.meta(`${heading} ${s.glyph("bullet")} ${String(paths.length)}`),
    ...paths.map((path) => `  ${s.meta(s.glyph("bullet"))} ${sanitizeScanDisplayPath(path)}`),
  ];
}
