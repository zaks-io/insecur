import { randomBytes } from "node:crypto";
import { auditEventId, type AuditEventId } from "@insecur/domain";

/** Crockford base32 alphabet (32 chars) for opaque ID bodies. */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateOpaqueBody(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(
    bytes,
    (byte) => CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length] ?? "0",
  ).join("");
}

export function generateAuditEventId(): AuditEventId {
  return auditEventId.brand(`aud_${generateOpaqueBody(26)}`);
}
