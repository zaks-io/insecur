import { bytesToBase64Url } from "@insecur/domain";
import { AUDIT_EXPORT_CHAIN_GENESIS } from "./audit-export-constants.js";
import { toBufferSource } from "./buffer.js";

export async function sha256Base64Url(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", toBufferSource(bytes));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function auditExportGenesisHash(): Promise<string> {
  return sha256Base64Url(AUDIT_EXPORT_CHAIN_GENESIS);
}
