import type { OrganizationId } from "@insecur/domain";
import {
  buildAuditExportJsonlEntries,
  serializeAuditExportJsonl,
} from "./audit-export-hash-chain.js";
import {
  assertAuditExportPayloadIsMetadataOnly,
  scanAuditExportForForbiddenSensitiveValues,
} from "./audit-export-event.js";
import {
  buildUnsignedAuditExportManifest,
  finalizeAuditExportManifest,
} from "./audit-export-manifest.js";
import type {
  AuditExportBundle,
  AuditExportEventPayload,
  AuditExportTimeRange,
  BuildAuditExportInput,
} from "./audit-export-types.js";

function assertTenantQualifiedEvents(
  organizationId: OrganizationId,
  events: readonly AuditExportEventPayload[],
): void {
  for (const event of events) {
    if (event.organization_id !== organizationId) {
      throw new Error("audit export events must match the requested organization scope");
    }
    assertAuditExportPayloadIsMetadataOnly(event);
    const forbiddenKey = scanAuditExportForForbiddenSensitiveValues(event);
    if (forbiddenKey !== null) {
      throw new Error(`audit export event contains forbidden sensitive value key: ${forbiddenKey}`);
    }
  }
}

function deriveTimeRange(
  events: readonly AuditExportEventPayload[],
  requested: AuditExportTimeRange,
): AuditExportTimeRange {
  if (events.length === 0) {
    return requested;
  }
  const timestamps = events.map((event) => event.recorded_at).sort();
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  if (first === undefined || last === undefined) {
    return requested;
  }
  return {
    from: first < requested.from ? first : requested.from,
    to: last > requested.to ? last : requested.to,
  };
}

/** Builds a tamper-evident tenant-qualified audit export bundle. */
export async function buildAuditExport(input: BuildAuditExportInput): Promise<AuditExportBundle> {
  const sortedEvents = [...input.events].sort((left, right) => {
    const timeCompare = left.recorded_at.localeCompare(right.recorded_at);
    if (timeCompare !== 0) {
      return timeCompare;
    }
    return left.id.localeCompare(right.id);
  });

  assertTenantQualifiedEvents(input.organizationId, sortedEvents);

  const entries = await buildAuditExportJsonlEntries(sortedEvents);
  const jsonl = serializeAuditExportJsonl(entries);
  const firstHash = entries[0]?.chain.entry_hash ?? null;
  const lastHash = entries[entries.length - 1]?.chain.entry_hash ?? null;
  const unsignedManifest = buildUnsignedAuditExportManifest({
    organizationId: input.organizationId,
    timeRange: deriveTimeRange(sortedEvents, input.timeRange),
    entryCount: entries.length,
    firstHash,
    lastHash,
    hmacKey: input.hmacKey,
    signingKey: input.signingKey,
  });
  const manifest = await finalizeAuditExportManifest({
    manifest: unsignedManifest,
    hmacKey: input.hmacKey,
    signingKey: input.signingKey,
    jsonl,
  });

  return { jsonl, manifest };
}
