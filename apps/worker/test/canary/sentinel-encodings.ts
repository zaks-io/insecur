/** High-entropy canary sentinel and its common transport encodings for persistence sweeps. */

export type SentinelEncoding = "raw" | "base64" | "base64url" | "hex";

export interface SentinelVariant {
  encoding: SentinelEncoding;
  pattern: string;
}

export interface CanarySentinel {
  /** Full sentinel Sensitive Value — never echo in failure output. */
  value: string;
  /** Safe prefix for diagnostics (redacted). */
  redactedPrefix: string;
  variants: SentinelVariant[];
}

function bytesToStandardBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToStandardBase64(bytes).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint a fresh high-entropy sentinel per run. Never commit fixed sentinels.
 */
export function mintCanarySentinel(): CanarySentinel {
  const entropy = new Uint8Array(32);
  crypto.getRandomValues(entropy);
  const runId = crypto.randomUUID();
  const value = `insecur-canary-${runId}-${bytesToHex(entropy)}`;
  const bytes = new TextEncoder().encode(value);

  return {
    value,
    redactedPrefix: `${value.slice(0, 16)}…`,
    variants: [
      { encoding: "raw", pattern: value },
      { encoding: "base64", pattern: bytesToStandardBase64(bytes) },
      { encoding: "base64url", pattern: bytesToBase64Url(bytes) },
      { encoding: "hex", pattern: bytesToHex(bytes) },
    ],
  };
}

export function escapeLikePattern(pattern: string): string {
  return pattern.replace(/\\/gu, "\\\\").replace(/%/gu, "\\%").replace(/_/gu, "\\_");
}
