import {
  assertAuditExportPayloadIsMetadataOnly,
  parseAuditExportJsonl,
  scanAuditExportForForbiddenSensitiveValues,
} from "../../src/index.js";

/**
 * Asserts every exported audit event is metadata-only: allowlisted detail keys and
 * no forbidden sensitive-value object keys (password, plaintext, value, etc.).
 *
 * Unlike substring checks on serialized JSONL, this permits legitimate metadata such as
 * `secret.non_protected_write` event codes and `resource_type: "secret"`.
 */
export function assertAuditExportJsonlIsMetadataOnly(jsonl: string): void {
  const entries = parseAuditExportJsonl(jsonl);
  for (const entry of entries) {
    assertAuditExportPayloadIsMetadataOnly(entry.event);
    const forbiddenKey = scanAuditExportForForbiddenSensitiveValues(entry.event);
    if (forbiddenKey !== null) {
      throw new Error(`audit export event contains forbidden sensitive value key: ${forbiddenKey}`);
    }
  }
}
