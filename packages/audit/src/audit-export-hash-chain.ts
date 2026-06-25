import { canonicalJsonStringify } from "./canonical-json.js";
import { auditExportGenesisHash, sha256Base64Url } from "./audit-export-hash.js";
import type { AuditExportEventPayload, AuditExportJsonlEntry } from "./audit-export-types.js";
import { AUDIT_EXPORT_SCHEMA_VERSION } from "./audit-export-constants.js";

export async function hashAuditExportEventPayload(
  event: AuditExportEventPayload,
  sequence: number,
  previousHash: string | null,
): Promise<string> {
  const previous = previousHash ?? (await auditExportGenesisHash());
  const payload = canonicalJsonStringify({ sequence, event });
  return sha256Base64Url(`${previous}\n${payload}`);
}

export async function buildAuditExportJsonlEntries(
  events: readonly AuditExportEventPayload[],
): Promise<AuditExportJsonlEntry[]> {
  const entries: AuditExportJsonlEntry[] = [];
  let previousHash: string | null = null;

  for (let sequence = 0; sequence < events.length; sequence += 1) {
    const event = events[sequence];
    if (event === undefined) {
      continue;
    }
    const entryHash = await hashAuditExportEventPayload(event, sequence, previousHash);
    entries.push({
      schema_version: AUDIT_EXPORT_SCHEMA_VERSION,
      sequence,
      event,
      chain: {
        previous_hash: previousHash,
        entry_hash: entryHash,
      },
    });
    previousHash = entryHash;
  }

  return entries;
}

export function serializeAuditExportJsonl(entries: readonly AuditExportJsonlEntry[]): string {
  if (entries.length === 0) {
    return "";
  }
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export function parseAuditExportJsonl(jsonl: string): AuditExportJsonlEntry[] {
  const trimmed = jsonl.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const entries: AuditExportJsonlEntry[] = [];
  for (const [lineNumber, line] of trimmed.split("\n").entries()) {
    if (line.length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`audit export JSONL line ${String(lineNumber + 1)} is not valid JSON`);
    }
    if (!isAuditExportJsonlEntry(parsed)) {
      throw new Error(
        `audit export JSONL line ${String(lineNumber + 1)} has an invalid entry shape`,
      );
    }
    entries.push(parsed);
  }
  return entries;
}

function isAuditExportJsonlEntry(value: unknown): value is AuditExportJsonlEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    entry.schema_version === AUDIT_EXPORT_SCHEMA_VERSION &&
    typeof entry.sequence === "number" &&
    typeof entry.event === "object" &&
    entry.event !== null &&
    typeof entry.chain === "object" &&
    entry.chain !== null
  );
}
