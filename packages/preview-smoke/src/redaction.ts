import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PreviewConfig } from "./env";

export interface Sentinel {
  fingerprint: string;
  value: string;
  variants: { encoding: string; pattern: string }[];
}

export function mintSmokeSentinel(): Sentinel {
  return sentinelForValue(`insecur-smoke-${randomUUID()}-${randomBytes(32).toString("hex")}`);
}

export function sentinelForValue(value: string): Sentinel {
  const bytes = Buffer.from(value, "utf8");
  return {
    fingerprint: createHash("sha256").update(value).digest("hex"),
    value,
    variants: [
      { encoding: "raw", pattern: value },
      { encoding: "base64", pattern: bytes.toString("base64") },
      { encoding: "base64url", pattern: bytes.toString("base64url") },
      { encoding: "hex", pattern: bytes.toString("hex") },
    ],
  };
}

export function redactorFor(
  preview: PreviewConfig,
  sentinel: Sentinel,
  extraPatterns: string[] = [],
): (value: unknown) => string {
  return redactorForPreview(preview, [
    ...sentinel.variants.map((variant) => variant.pattern),
    ...extraPatterns,
  ]);
}

export function redactorForPreview(
  preview: PreviewConfig,
  extraPatterns: string[] = [],
): (value: unknown) => string {
  return createRedactor([
    preview.databaseUrl,
    ...databasePasswordPatterns(preview.databaseUrl),
    preview.signingSecret,
    ...extraPatterns,
  ]);
}

function createRedactor(patterns: string[]): (value: unknown) => string {
  const ordered = [...new Set(patterns.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
  return (value: unknown) => {
    let text = redactValue(value);
    for (const pattern of ordered) {
      text = text.split(pattern).join("[redacted]");
    }
    return text;
  };
}

export function redactValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (value === undefined) {
    return "";
  }
  if (typeof value === "function") {
    return "[function]";
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function databasePasswordPatterns(databaseUrl: string): string[] {
  try {
    const password = new URL(databaseUrl).password;
    return [password, decodeURIComponent(password)];
  } catch {
    return [];
  }
}
