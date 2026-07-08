import {
  assertAuditExportPayloadIsMetadataOnly,
  parseAuditExportJsonl,
  scanAuditExportForForbiddenSensitiveValues,
} from "@insecur/audit";
import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";

import { assertEqual, asRecord, requireString, type JsonRecord } from "./http.js";
import { requireObjectArray } from "./metadata-read-assertions.js";

export function assertCliSecretsListMetadataOnly(body: JsonRecord, label: string): JsonRecord[] {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  return requireObjectArray(data.secrets, `${label} secrets`);
}

export function assertCliSecretsVersionsMetadataOnly(
  body: JsonRecord,
  label: string,
): { secretId: string; versions: JsonRecord[] } {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  return {
    secretId: requireString(data.secretId, `${label} secretId`),
    versions: requireObjectArray(data.versions, `${label} versions`),
  };
}

export function assertCliAuditTailMetadataOnly(body: JsonRecord, label: string): JsonRecord[] {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  return requireObjectArray(data.events, `${label} events`);
}

/** Asserts the exported bundle is well-formed and every entry is metadata-only. */
export function assertCliAuditExportBundleMetadataOnly(body: JsonRecord, label: string): void {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  const jsonl = requireString(data.jsonl, `${label} jsonl`);
  const manifest = asRecord(data.manifest, `${label} manifest`);
  requireString(manifest.organization_id, `${label} manifest organization_id`);

  const entries = parseAuditExportJsonl(jsonl);
  if (entries.length === 0) {
    throw new Error(`${label} exported zero audit events for the smoke time range.`);
  }
  for (const [index, entry] of entries.entries()) {
    assertAuditExportPayloadIsMetadataOnly(entry.event);
    const forbiddenKey = scanAuditExportForForbiddenSensitiveValues(entry.event);
    if (forbiddenKey !== null) {
      throw new Error(
        `${label} entry ${String(index)} contains forbidden sensitive value key: ${forbiddenKey}`,
      );
    }
  }
}

/**
 * Preview does not yet wire an audit-export HMAC secret to the smoke run
 * (only Runtime holds it), so `insecur audit verify` cannot prove
 * `manifest_hmac` and reports `status: "invalid"` with
 * `audit.export.key_evidence_missing`. Hash chain, signature, and tenant
 * scope must still verify against the published signing key. This asserts
 * that tracked, expected shape rather than a full "valid" result so the
 * smoke fails loudly the moment any of those other checks regress.
 */
export function assertCliAuditVerifyExpectedResult(
  body: JsonRecord,
  label: string,
  expectedOrganizationId: string,
): void {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  const integrity = asRecord(data.integrity, `${label} integrity`);

  assertEqual(data.organizationId, expectedOrganizationId, `${label} organizationId`);
  assertEqual(integrity.hashChain, "valid", `${label} integrity.hashChain`);
  assertEqual(integrity.tenantScope, "valid", `${label} integrity.tenantScope`);
  assertEqual(integrity.signature, "valid", `${label} integrity.signature`);

  if (data.status === "valid") {
    assertEqual(integrity.manifestHmac, "valid", `${label} integrity.manifestHmac`);
    return;
  }

  assertCliAuditVerifyMissingHmacEvidence(data, integrity, label);
}

function assertCliAuditVerifyMissingHmacEvidence(
  data: JsonRecord,
  integrity: JsonRecord,
  label: string,
): void {
  assertEqual(data.status, "invalid", `${label} status`);
  assertEqual(integrity.manifestHmac, "missing", `${label} integrity.manifestHmac`);
  const failureCodes = data.failureCodes;
  if (!Array.isArray(failureCodes) || !failureCodes.includes("audit.export.key_evidence_missing")) {
    throw new Error(
      `${label} expected failureCodes to include audit.export.key_evidence_missing (no HMAC secret wired to preview smoke), got ${JSON.stringify(failureCodes)}`,
    );
  }
}
