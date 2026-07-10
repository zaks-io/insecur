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
 * Smallest generated-secret length the smoke may ever write or print. The
 * shape thresholds below are DERIVED from this so detector confidence does not
 * silently depend on the current `--length 32`: `secrets set --generate`
 * defaults to 32 random bytes today, but a future step or a regression to a
 * shorter length must still be caught. `bytesToBase64Url` of N random bytes is
 * `ceil(N*4/3)` unpadded base64url chars; hex is `2*N`. At 16 bytes that is 22
 * base64url chars and 32 hex chars — the floors used here. Lower this only if
 * the smoke ever legitimately generates a shorter secret (and add coverage).
 */
export const MIN_GENERATED_SECRET_BYTES = 16;

const SECRET_SHAPED_HEX_MIN = MIN_GENERATED_SECRET_BYTES * 2; // 32
const SECRET_SHAPED_BASE64URL_MIN = Math.ceil((MIN_GENERATED_SECRET_BYTES * 4) / 3); // 22

/**
 * Secret-material-shaped token detectors. These catch values the harness
 * cannot register in a redactor because it never learns them (for example a
 * `secrets set --generate` value leaking into config or output). Generated
 * secrets are base64url (`bytesToBase64Url`, charset `[A-Za-z0-9_-]`) and the
 * machine root key is hex; `+` and `/` stay out of the base64url charset so
 * path separators already segment filesystem paths. The thresholds are the
 * 16-byte floors (`MIN_GENERATED_SECRET_BYTES`), well below the current
 * `--length 32` (43 base64url / 64 hex), so a shorter generated secret still
 * trips the detector.
 *
 * At the lowered base64url floor two BENIGN long runs would otherwise match:
 * opaque resource ids (`prefix_` + 26-char uppercase body) and env-var-shaped
 * keys (`INSECUR_...`). Both are structurally distinct from a base64url secret
 * body, so `isBenignDenseToken` excuses those exact shapes. A random 16-byte
 * secret matches neither shape (all-uppercase base64url is ~1-in-1e5 and stays
 * covered by the redactor / named-material checks), so this keeps zero
 * false-negatives on real secrets while dropping the false positives. Callers
 * pass workspace temp-dir path segments and child-output markers as
 * `allowedTokens` for the remaining hyphenated-slug runs.
 */
const SECRET_SHAPED_TOKEN_PATTERNS: readonly { reason: string; pattern: RegExp }[] = [
  {
    reason: `hex blob of ${String(SECRET_SHAPED_HEX_MIN)}+ chars`,
    pattern: new RegExp(`[0-9a-fA-F]{${String(SECRET_SHAPED_HEX_MIN)},}`, "g"),
  },
  {
    reason: `base64url blob of ${String(SECRET_SHAPED_BASE64URL_MIN)}+ chars`,
    pattern: new RegExp(`[A-Za-z0-9_-]{${String(SECRET_SHAPED_BASE64URL_MIN)},}`, "g"),
  },
];

/** Exact opaque resource id shape: lowercase type prefix + underscore + 26-char uppercase body. */
const OPAQUE_ID_TOKEN_PATTERN = /^[a-z]{2,5}_[0-9A-Z]{26}$/;
/** Env-var-shaped key (for example `INSECUR_SMOKE_GENERATED_SECRET`): all-uppercase with underscores. */
const ENV_VAR_KEY_TOKEN_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * True when a long dense token is one of the two structurally-distinct benign
 * shapes (opaque id or env-var key) rather than a base64url secret body. See
 * SECRET_SHAPED_TOKEN_PATTERNS for why these are the only shapes that must be
 * excused at the lowered threshold.
 */
function isBenignDenseToken(token: string): boolean {
  return OPAQUE_ID_TOKEN_PATTERN.test(token) || ENV_VAR_KEY_TOKEN_PATTERN.test(token);
}

/** Values shorter than this cannot be secret material; skip to avoid trivial substring hits. */
const MIN_MATERIAL_LENGTH = 8;

export interface SecretShapedTokenHit {
  readonly reason: string;
  readonly length: number;
}

/**
 * Finds the first secret-material-shaped token in `text` that is neither an
 * explicitly allowlisted token (for example harness-minted child output
 * markers or workspace temp-dir path segments) nor a benign dense shape
 * (opaque id / env-var key). The hit reports shape and length only, never the
 * token itself.
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
      if (isBenignDenseToken(token)) {
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
  /** Proven absent in every encoding from `materialEncodingVariants`. */
  readonly forbiddenMaterials?: readonly SensitiveMaterial[];
  /** Expected long tokens (for example child output markers) the shape scan must not flag. */
  readonly allowedTokens?: readonly string[];
}

interface MaterialEncodingVariant {
  readonly encoding: string;
  readonly pattern: string;
}

/**
 * All encodings a named forbidden material is proven absent in: the shared
 * raw/base64/base64url/hex set (`sentinelForValue`) plus url-percent-encoded
 * and JSON `\uXXXX`-escaped forms so a value smuggled through a URL query or a
 * JSON string escape is still caught.
 *
 * Known limitation: this is an enumerated encoding list, not exhaustive. Forms
 * not modeled here (for example HTML entity escapes, double-url-encoding, or
 * gzip/other binary transforms) would slip past named-material absence — the
 * same coverage model as the redactor. Today's First Value CLI flow emits none
 * of those, and the secret-shaped-token scan is an independent backstop for
 * base64url/hex blobs regardless of naming; extend this set if a future
 * surface introduces another reversible encoding.
 */
function materialEncodingVariants(value: string): readonly MaterialEncodingVariant[] {
  return [
    ...sentinelForValue(value).variants,
    { encoding: "url", pattern: encodeURIComponent(value) },
    { encoding: "json-unicode-escape", pattern: jsonUnicodeEscape(value) },
  ];
}

/** JSON `\uXXXX` escape of every code unit — the form a value takes inside a JSON string body. */
function jsonUnicodeEscape(value: string): string {
  let escaped = "";
  for (let index = 0; index < value.length; index += 1) {
    escaped += `\\u${value.charCodeAt(index).toString(16).padStart(4, "0")}`;
  }
  return escaped;
}

/**
 * Proves a raw text surface (config file contents, CLI stdout/stderr) carries
 * no registered sensitive value, no named forbidden material in any modeled
 * encoding (`materialEncodingVariants`), and no secret-material-shaped token.
 */
export function assertSurfaceTextMetadataOnly(input: SurfaceTextScanInput): void {
  if (input.redactor(input.text) !== input.text) {
    throw new Error(`${input.label} contains redactor-registered sensitive material`);
  }
  for (const material of input.forbiddenMaterials ?? []) {
    if (material.value.length < MIN_MATERIAL_LENGTH) {
      continue;
    }
    for (const variant of materialEncodingVariants(material.value)) {
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
