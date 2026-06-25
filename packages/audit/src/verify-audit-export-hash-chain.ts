import {
  AUDIT_EXPORT_FAILURE_CODES,
  type AuditExportFailureCode,
  type AuditExportIntegrityChecks,
  type AuditExportJsonlEntry,
  type AuditExportManifest,
} from "./audit-export-types.js";
import { hashAuditExportEventPayload } from "./audit-export-hash-chain.js";

async function verifyEntryHash(entry: AuditExportJsonlEntry): Promise<boolean> {
  const recomputed = await hashAuditExportEventPayload(
    entry.event,
    entry.sequence,
    entry.chain.previous_hash,
  );
  return recomputed === entry.chain.entry_hash;
}

function verifyEntryLink(
  entries: readonly AuditExportJsonlEntry[],
  entry: AuditExportJsonlEntry,
): boolean {
  if (entry.sequence === 0) {
    return true;
  }
  const previous = entries[entry.sequence - 1];
  return previous?.chain.entry_hash === entry.chain.previous_hash;
}

function verifyManifestHashBounds(input: {
  readonly entries: readonly AuditExportJsonlEntry[];
  readonly manifest: AuditExportManifest;
}): boolean {
  const first = input.entries[0]?.chain.entry_hash ?? null;
  const last = input.entries[input.entries.length - 1]?.chain.entry_hash ?? null;
  return first === input.manifest.first_hash && last === input.manifest.last_hash;
}

export async function verifyHashChain(input: {
  readonly entries: readonly AuditExportJsonlEntry[];
  readonly manifest: AuditExportManifest;
}): Promise<{
  readonly status: AuditExportIntegrityChecks["hash_chain"];
  readonly failureCodes: readonly AuditExportFailureCode[];
}> {
  if (input.entries.length === 0) {
    return { status: "missing", failureCodes: [] };
  }

  for (const entry of input.entries) {
    if (!(await verifyEntryHash(entry))) {
      return {
        status: "invalid",
        failureCodes: [AUDIT_EXPORT_FAILURE_CODES.entryTampered],
      };
    }
    if (!verifyEntryLink(input.entries, entry)) {
      return {
        status: "invalid",
        failureCodes: [AUDIT_EXPORT_FAILURE_CODES.chainBroken],
      };
    }
  }

  if (!verifyManifestHashBounds(input)) {
    return {
      status: "invalid",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.chainBroken],
    };
  }

  return { status: "valid", failureCodes: [] };
}
