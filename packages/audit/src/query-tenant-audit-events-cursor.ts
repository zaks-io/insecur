import {
  auditEventId,
  base64UrlToBytes,
  bytesToBase64Url,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import type { AuditEventId } from "@insecur/domain";

export interface AuditEventsCursor {
  readonly createdAt: string;
  readonly id: AuditEventId;
}

function invalidCursorError(): Error & {
  code: typeof VALIDATION_ERROR_CODES.invalidOpaqueResourceId;
} {
  return Object.assign(new Error("Invalid audit events cursor."), {
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
  });
}

function decodeCursorJson(raw: string): unknown {
  const bytes = base64UrlToBytes(raw);
  if (bytes === null) {
    throw invalidCursorError();
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw invalidCursorError();
  }
}

function readCursorFields(parsed: unknown): { createdAt: string; id: string } {
  if (typeof parsed !== "object" || parsed === null) {
    throw invalidCursorError();
  }

  const record = parsed as { createdAt?: unknown; id?: unknown };
  if (typeof record.createdAt !== "string" || typeof record.id !== "string") {
    throw invalidCursorError();
  }

  return { createdAt: record.createdAt, id: record.id };
}

export function parseAuditEventsCursor(raw: string): AuditEventsCursor {
  const fields = readCursorFields(decodeCursorJson(raw));
  const parsedId = auditEventId.parse(fields.id);
  if (!parsedId.ok) {
    throw invalidCursorError();
  }

  return { createdAt: fields.createdAt, id: parsedId.value };
}

export function encodeAuditEventsCursor(cursor: AuditEventsCursor): string {
  return bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id })),
  );
}
