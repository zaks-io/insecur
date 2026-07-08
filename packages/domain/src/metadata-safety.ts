export interface MetadataSafetyOptions {
  extraForbiddenKeys?: readonly string[];
  extraSensitivePatterns?: readonly RegExp[];
}

const DEFAULT_SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
];

export const DEFAULT_FORBIDDEN_KEYS = [
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
] as const;

type UnknownRecord = Record<string, unknown>;

interface MetadataSafetyContext {
  forbiddenKeys: ReadonlySet<string>;
  patterns: readonly RegExp[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createMetadataSafetyContext(options: MetadataSafetyOptions): MetadataSafetyContext {
  return {
    forbiddenKeys: new Set<string>([
      ...DEFAULT_FORBIDDEN_KEYS,
      ...(options.extraForbiddenKeys ?? []),
    ]),
    patterns: [...DEFAULT_SENSITIVE_VALUE_PATTERNS, ...(options.extraSensitivePatterns ?? [])],
  };
}

function inspectString(
  value: string,
  path: string,
  violations: string[],
  context: MetadataSafetyContext,
): void {
  for (const pattern of context.patterns) {
    if (pattern.test(value)) {
      violations.push(`${path}: matched sensitive value pattern`);
    }
  }
}

function inspectValue(
  value: unknown,
  path: string,
  violations: string[],
  context: MetadataSafetyContext,
): void {
  if (typeof value === "string") {
    inspectString(value, path, violations, context);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      inspectValue(entry, `${path}[${String(index)}]`, violations, context);
    });
    return;
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (context.forbiddenKeys.has(key)) {
        violations.push(`${childPath}: forbidden metadata key`);
      }
      inspectValue(entry, childPath, violations, context);
    }
  }
}

export function findMetadataSafetyViolations(
  value: unknown,
  options: MetadataSafetyOptions = {},
): string[] {
  const context = createMetadataSafetyContext(options);
  const violations: string[] = [];
  inspectValue(value, "", violations, context);
  return violations;
}

export function assertMetadataSafe(value: unknown, options: MetadataSafetyOptions = {}): void {
  const violations = findMetadataSafetyViolations(value, options);
  if (violations.length > 0) {
    throw new Error(`Value is not metadata-safe: ${violations.join("; ")}`);
  }
}
