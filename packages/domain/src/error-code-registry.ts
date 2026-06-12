import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isKnownErrorCodeInCatalog, listKnownErrorCodes } from "./known-error-code-catalog.js";

export const CLIENT_SIDE_HTTP_MARKER = "n/a (client-side)";

export interface ErrorCodeRegistryRow {
  code: string;
  exitCode: number;
  httpStatus: number | typeof CLIENT_SIDE_HTTP_MARKER;
  notes: string;
}

const TABLE_ROW_PATTERN =
  /^\|\s*`([^`]+)`\s*\|\s*`(\d+)`\s*\|\s*`?(\d+|n\/a \(client-side\))`?\s*\|\s*(.*?)\s*\|$/;

function readRegistryMarkdown(): string {
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  return readFileSync(`${repoRoot}/docs/cli-and-sync.md`, "utf8");
}

function extractRegistryTable(markdown: string): string[] {
  const sectionStart = markdown.indexOf("### Error Code To Exit Code Mapping");
  if (sectionStart < 0) {
    throw new Error("Missing Error Code To Exit Code Mapping section in docs/cli-and-sync.md");
  }

  const tableStart = markdown.indexOf("| Stable error code", sectionStart);
  const tableEnd = markdown.indexOf("\n\nMappings without a dotted code:", tableStart);
  if (tableStart < 0 || tableEnd < 0) {
    throw new Error("Could not locate the error-code registry table in docs/cli-and-sync.md");
  }

  return markdown
    .slice(tableStart, tableEnd)
    .split("\n")
    .slice(2)
    .filter((line) => line.trim().startsWith("|"));
}

export function parseErrorCodeRegistryTable(
  markdown = readRegistryMarkdown(),
): ErrorCodeRegistryRow[] {
  return extractRegistryTable(markdown).map((line) => {
    const match = TABLE_ROW_PATTERN.exec(line);
    if (!match) {
      throw new Error(`Could not parse registry table row: ${line}`);
    }

    const code = match[1];
    const exitCode = match[2];
    const httpStatus = match[3];
    const notes = match[4];
    if (
      code === undefined ||
      exitCode === undefined ||
      httpStatus === undefined ||
      notes === undefined
    ) {
      throw new Error(`Could not parse registry table row: ${line}`);
    }
    return {
      code,
      exitCode: Number(exitCode),
      httpStatus:
        httpStatus === CLIENT_SIDE_HTTP_MARKER ? CLIENT_SIDE_HTTP_MARKER : Number(httpStatus),
      notes: notes.trim(),
    };
  });
}

export function registryRowsByCode(
  rows: readonly ErrorCodeRegistryRow[] = parseErrorCodeRegistryTable(),
): Map<string, ErrorCodeRegistryRow> {
  return new Map(rows.map((row) => [row.code, row]));
}

export function assertKnownErrorCodeRegistryCoverage(
  rowsByCode: Map<string, ErrorCodeRegistryRow>,
  catalogCodes: readonly string[] = listKnownErrorCodes(),
): void {
  const missing = catalogCodes.filter((code) => !rowsByCode.has(code));
  if (missing.length > 0) {
    throw new Error(
      `Known error codes missing from docs/cli-and-sync.md registry: ${missing.join(", ")}`,
    );
  }
}

export function httpStatusesForRegistry(
  rows: readonly ErrorCodeRegistryRow[],
): Map<string, number> {
  const statuses = new Map<string, number>();
  for (const row of rows) {
    if (row.httpStatus !== CLIENT_SIDE_HTTP_MARKER) {
      statuses.set(row.code, row.httpStatus);
    }
  }
  return statuses;
}

function assertImplementedStatusMatchesRegistryRow(
  code: string,
  status: number,
  rows: readonly ErrorCodeRegistryRow[],
): void {
  const row = rows.find((candidate) => candidate.code === code);
  if (!row) {
    throw new Error(`HTTP status map contains unregistered code: ${code}`);
  }
  if (row.httpStatus === CLIENT_SIDE_HTTP_MARKER) {
    throw new Error(`HTTP status map must not include client-side-only code: ${code}`);
  }
  if (row.httpStatus !== status) {
    throw new Error(
      `HTTP status mismatch for ${code}: map=${String(status)}, registry=${String(row.httpStatus)}`,
    );
  }
}

function assertCatalogCodesHaveRegistryHttpMappings(
  implementedStatuses: ReadonlyMap<string, number>,
  expectedStatuses: ReadonlyMap<string, number>,
): void {
  for (const [code, status] of expectedStatuses) {
    if (!isKnownErrorCodeInCatalog(code)) {
      continue;
    }
    const implemented = implementedStatuses.get(code);
    if (implemented === undefined) {
      throw new Error(`Known error code missing from HTTP status map: ${code}`);
    }
    if (implemented !== status) {
      throw new Error(
        `HTTP status mismatch for ${code}: map=${String(implemented)}, registry=${String(status)}`,
      );
    }
  }
}

export function assertRegistryHttpLockstep(
  implementedStatuses: ReadonlyMap<string, number>,
  rows: readonly ErrorCodeRegistryRow[] = parseErrorCodeRegistryTable(),
): void {
  for (const [code, status] of implementedStatuses) {
    assertImplementedStatusMatchesRegistryRow(code, status, rows);
  }
  assertCatalogCodesHaveRegistryHttpMappings(implementedStatuses, httpStatusesForRegistry(rows));
}
