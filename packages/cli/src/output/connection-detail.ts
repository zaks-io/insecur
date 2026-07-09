import { relativeTime } from "./cell-format.js";
import { emptyValue, renderDetail, type DetailValue } from "./detail.js";
import { statusText } from "./format.js";
import { sanitizeDisplayText } from "./sanitize-display.js";
import { getStyle } from "./style.js";

interface ConnectionSummary {
  readonly id: string;
  readonly displayName: string;
  readonly provider: string;
  readonly connectionMethod: string;
  readonly status: string;
  readonly hasActiveCredential: boolean;
  readonly lastValidationCheckedAt: string | null;
  readonly createdAt: string;
}

interface ConnectionStatusPayload {
  readonly connection: ConnectionSummary;
}

function credentialValue(connection: ConnectionSummary): string {
  const s = getStyle();
  return connection.hasActiveCredential
    ? s.ok(`${s.glyph("ok")} Active`)
    : `${s.glyph("fail")} None`;
}

export function formatConnectionStatusHuman(data: ConnectionStatusPayload): string {
  const s = getStyle();
  const c = data.connection;
  const pairs: DetailValue[] = [
    { label: "Connection", value: sanitizeDisplayText(c.displayName) },
    { label: "Connection ID", value: s.id(c.id) },
    { label: "Provider", value: sanitizeDisplayText(c.provider) },
    { label: "Method", value: sanitizeDisplayText(c.connectionMethod) },
    { label: "Status", value: statusText(c.status) },
    { label: "Credential", value: credentialValue(c) },
    {
      label: "Last Checked",
      value:
        c.lastValidationCheckedAt === null ? emptyValue() : relativeTime(c.lastValidationCheckedAt),
    },
    { label: "Created", value: relativeTime(c.createdAt) },
  ];
  return renderDetail(pairs);
}
