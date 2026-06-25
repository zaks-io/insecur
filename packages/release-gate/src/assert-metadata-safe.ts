import type { SecurityEvidenceBundle } from "./types.js";

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
];

const FORBIDDEN_KEYS = new Set([
  "secret",
  "match",
  "line",
  "entropy",
  "fingerprint",
  "value",
  "content",
  "password",
  "token",
  "api_key",
  "apikey",
  "private_key",
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectString(value: string, path: string, violations: string[]): void {
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      violations.push(`${path}: matched sensitive value pattern`);
    }
  }
}

function inspectArray(value: unknown[], path: string, violations: string[]): void {
  value.forEach((entry, index) => {
    inspectValue(entry, `${path}[${String(index)}]`, violations);
  });
}

function inspectRecord(value: UnknownRecord, path: string, violations: string[]): void {
  for (const [key, entry] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;

    if (FORBIDDEN_KEYS.has(key)) {
      violations.push(`${childPath}: forbidden metadata key`);
    }

    inspectValue(entry, childPath, violations);
  }
}

function inspectValue(value: unknown, path: string, violations: string[]): void {
  if (typeof value === "string") {
    inspectString(value, path, violations);
    return;
  }

  if (Array.isArray(value)) {
    inspectArray(value, path, violations);
    return;
  }

  if (isRecord(value)) {
    inspectRecord(value, path, violations);
  }
}

export function findMetadataSafetyViolations(bundle: SecurityEvidenceBundle): string[] {
  const violations: string[] = [];
  inspectValue(bundle, "", violations);
  return violations;
}

export function assertBundleIsMetadataSafe(bundle: SecurityEvidenceBundle): void {
  const violations = findMetadataSafetyViolations(bundle);
  if (violations.length > 0) {
    throw new Error(`Security evidence bundle is not metadata-safe: ${violations.join("; ")}`);
  }
}

export function bundleContainsSensitiveMaterial(bundle: SecurityEvidenceBundle): boolean {
  return findMetadataSafetyViolations(bundle).length > 0;
}
