import { FORBIDDEN_ENVELOPE_KEYS, OPAQUE_RESOURCE_ID_PATTERN } from "@insecur/domain";

import { requireString } from "./http";
import { sentinelForValue } from "./redaction";

/**
 * Named sensitive material a scan must prove ABSENT from a surface. Failure
 * messages carry the `name`, never the `value` (the scans themselves must not
 * leak what they scan for).
 */
export interface SensitiveMaterial {
  readonly name: string;
  readonly value: string;
}

/**
 * Key names that must never appear in CLI config files or output envelopes.
 * Extends the domain envelope vocabulary with the credential key names the
 * CLI's own forbidden-config-key gate rejects (duplicated here to keep
 * preview-smoke off the CLI package's dependency graph).
 */
const FORBIDDEN_SURFACE_KEYS = new Set(
  [
    ...FORBIDDEN_ENVELOPE_KEYS,
    "refreshToken",
    "accessToken",
    "sessionToken",
    "credential",
    "apiKey",
    "clientSecret",
    "deployKey",
    "oidcToken",
    "bearer",
    "authorization",
  ].map((key) => key.toLowerCase()),
);

/**
 * Secret-material-shaped token detectors. These catch values the harness
 * cannot register in a redactor because it never learns them (for example a
 * `secrets set --generate` value leaking into config or output): 32 random
 * bytes serialize to >= 64 hex chars or >= 43 base64url chars. `+` and `/`
 * stay out of the charset so filesystem paths inside metadata (for example
 * `configPath`) cannot false-positive; generated secrets are base64url
 * (`bytesToBase64Url`) and the machine root key is hex, so both covered
 * shapes keep matching.
 */
const SECRET_SHAPED_TOKEN_PATTERNS: readonly { reason: string; pattern: RegExp }[] = [
  { reason: "hex blob of 64+ chars", pattern: /[0-9a-fA-F]{64,}/g },
  { reason: "base64url blob of 43+ chars", pattern: /[A-Za-z0-9_-]{43,}/g },
];

/** Values shorter than this cannot be secret material; skip to avoid trivial substring hits. */
const MIN_MATERIAL_LENGTH = 8;

export interface SecretShapedTokenHit {
  readonly reason: string;
  readonly length: number;
}

/**
 * Finds the first secret-material-shaped token in `text` that is not covered
 * by `allowedTokens` (for example harness-minted child output markers, which
 * are long `[A-Z0-9_]` runs by construction). The hit reports shape and
 * length only, never the token itself.
 */
export function findSecretShapedToken(
  text: string,
  allowedTokens: readonly string[] = [],
): SecretShapedTokenHit | null {
  for (const { pattern, reason } of SECRET_SHAPED_TOKEN_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const token = match[0];
      if (allowedTokens.some((allowed) => allowed.includes(token))) {
        continue;
      }
      return { reason, length: token.length };
    }
  }
  return null;
}

export interface SurfaceTextScanInput {
  readonly label: string;
  readonly text: string;
  readonly redactor: (value: unknown) => string;
  /** Proven absent in raw, base64, base64url, and hex encodings. */
  readonly forbiddenMaterials?: readonly SensitiveMaterial[];
  /** Expected long tokens (for example child output markers) the shape scan must not flag. */
  readonly allowedTokens?: readonly string[];
}

/**
 * Proves a raw text surface (config file contents, CLI stdout/stderr) carries
 * no registered sensitive value, no named forbidden material in any common
 * encoding, and no secret-material-shaped token.
 */
export function assertSurfaceTextMetadataOnly(input: SurfaceTextScanInput): void {
  if (input.redactor(input.text) !== input.text) {
    throw new Error(`${input.label} contains redactor-registered sensitive material`);
  }
  for (const material of input.forbiddenMaterials ?? []) {
    if (material.value.length < MIN_MATERIAL_LENGTH) {
      continue;
    }
    for (const variant of sentinelForValue(material.value).variants) {
      if (input.text.includes(variant.pattern)) {
        throw new Error(`${input.label} contains ${material.name} (${variant.encoding} encoding)`);
      }
    }
  }
  const hit = findSecretShapedToken(input.text, input.allowedTokens);
  if (hit !== null) {
    throw new Error(
      `${input.label} contains a secret-shaped token: ${hit.reason} (length ${String(hit.length)})`,
    );
  }
}

/**
 * Deep-walks parsed JSON (config files, CLI envelopes) and proves no key is a
 * credential/secret carrier name and no string leaf is secret-shaped.
 */
export function assertJsonTreeMetadataOnly(
  value: unknown,
  label: string,
  allowedTokens: readonly string[] = [],
): void {
  if (typeof value === "string") {
    assertStringLeafMetadataOnly(value, label, allowedTokens);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertJsonTreeMetadataOnly(entry, `${label}[${String(index)}]`, allowedTokens);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    assertRecordKeysAndValuesMetadataOnly(value as Record<string, unknown>, label, allowedTokens);
    return;
  }
  assertPrimitiveJsonLeaf(value, label);
}

function assertStringLeafMetadataOnly(
  value: string,
  label: string,
  allowedTokens: readonly string[],
): void {
  const hit = findSecretShapedToken(value, allowedTokens);
  if (hit !== null) {
    throw new Error(
      `${label} string value is secret-shaped: ${hit.reason} (length ${String(hit.length)})`,
    );
  }
}

function assertRecordKeysAndValuesMetadataOnly(
  record: Record<string, unknown>,
  label: string,
  allowedTokens: readonly string[],
): void {
  for (const [key, entry] of Object.entries(record)) {
    if (FORBIDDEN_SURFACE_KEYS.has(key.toLowerCase())) {
      throw new Error(`${label} contains forbidden key: ${key}`);
    }
    assertJsonTreeMetadataOnly(entry, `${label}.${key}`, allowedTokens);
  }
}

function assertPrimitiveJsonLeaf(value: unknown, label: string): void {
  if (value !== null && typeof value !== "boolean" && typeof value !== "number") {
    throw new Error(`${label} contains a non-JSON value of type ${typeof value}`);
  }
}

export interface KeyAllowlist {
  readonly required: readonly string[];
  readonly optional?: readonly string[];
}

/**
 * Positive structural assertion: `record` has every required key and nothing
 * outside required + optional. An unexpected key fails loudly instead of
 * silently widening a metadata-only surface.
 */
export function assertExactKeys(
  record: Record<string, unknown>,
  allowlist: KeyAllowlist,
  label: string,
): void {
  const allowed = new Set([...allowlist.required, ...(allowlist.optional ?? [])]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unexpected key: ${key}`);
    }
  }
  for (const key of allowlist.required) {
    if (!(key in record)) {
      throw new Error(`${label} is missing required key: ${key}`);
    }
  }
}

const SAFE_DISPLAY_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

/** Opaque-id type check: the only id shape allowed in CLI config and output surfaces. */
export function assertOpaqueIdWithPrefix(value: unknown, prefix: string, label: string): string {
  const raw = requireString(value, label);
  if (!raw.startsWith(`${prefix}_`) || !OPAQUE_RESOURCE_ID_PATTERN.test(raw)) {
    throw new Error(`${label} must be an opaque ${prefix}_ resource id`);
  }
  return raw;
}

/** Short human labels (profile slug, display name): bounded charset, no room for blobs. */
export function assertSafeDisplayLabel(value: unknown, label: string): string {
  const raw = requireString(value, label);
  if (!SAFE_DISPLAY_LABEL_PATTERN.test(raw)) {
    throw new Error(`${label} is not a short metadata-safe label`);
  }
  return raw;
}
