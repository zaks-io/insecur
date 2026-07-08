import { base64UrlToBytes } from "@insecur/domain";

export const SECRET_VALUE_ENCODING_CLASSES = ["utf-8", "hex-shaped", "base64-shaped"] as const;
export type SecretValueEncodingClass = (typeof SECRET_VALUE_ENCODING_CLASSES)[number];

export const SECRET_SHAPE_MATCH_VERDICTS = ["matches", "does_not_match", "no_shape_rule"] as const;
export type SecretShapeMatchVerdict = (typeof SECRET_SHAPE_MATCH_VERDICTS)[number];

export interface SecretWriteDescriptiveVerdicts {
  readonly valueByteLength: number;
  readonly encodingClass: SecretValueEncodingClass;
  readonly isEmpty: boolean;
  readonly hasLeadingOrTrailingWhitespace: boolean;
  readonly looksLikePlaceholder: boolean;
  readonly secretShapeMatchVerdict: SecretShapeMatchVerdict;
}

const HEX_SHAPED_PATTERN = /^[0-9a-fA-F]+$/u;
const BASE64URL_SHAPED_PATTERN = /^[A-Za-z0-9_-]+$/u;
const RANDOM_GENERATION_HINT_PATTERN = /^random:(\d+)$/u;

const PLACEHOLDER_LITERALS = new Set([
  "changeme",
  "change_me",
  "change-me",
  "placeholder",
  "replace_me",
  "replace-me",
  "insert_api_key",
  "insert-api-key",
  "your_api_key_here",
  "your-api-key-here",
  "todo",
  "tbd",
  "xxx",
  "example",
  "dummy",
  "fake",
  "not_a_real_secret",
  "not-a-real-secret",
]);

const PLACEHOLDER_SUBSTRING_PATTERNS = [
  /placeholder/iu,
  /change[_-]?me/iu,
  /your[_-].*[_-]here/iu,
  /insert[_-].*[_-]here/iu,
  /replace[_-].*[_-]here/iu,
  /^x{8,}$/iu,
] as const;

const ANGLE_BRACKET_PLACEHOLDER_PATTERN = /^<[^>]+>$/u;
const MUSTACHE_PLACEHOLDER_PATTERN = /^\{\{[^}]+\}\}$/u;

function decodeUtf8(valueUtf8: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(valueUtf8);
}

function classifyEncodingClass(text: string): SecretValueEncodingClass {
  if (text.length > 0 && BASE64URL_SHAPED_PATTERN.test(text) && base64UrlToBytes(text) !== null) {
    return "base64-shaped";
  }
  if (text.length >= 2 && text.length % 2 === 0 && HEX_SHAPED_PATTERN.test(text)) {
    return "hex-shaped";
  }
  return "utf-8";
}

function hasLeadingOrTrailingWhitespace(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  const first = text.codePointAt(0);
  const last = text.codePointAt(text.length - 1);
  if (first === undefined || last === undefined) {
    return false;
  }
  return /\s/u.test(String.fromCodePoint(first)) || /\s/u.test(String.fromCodePoint(last));
}

function looksLikePlaceholder(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  if (PLACEHOLDER_LITERALS.has(normalized)) {
    return true;
  }
  if (
    ANGLE_BRACKET_PLACEHOLDER_PATTERN.test(trimmed) ||
    MUSTACHE_PLACEHOLDER_PATTERN.test(trimmed)
  ) {
    return true;
  }

  return PLACEHOLDER_SUBSTRING_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function parseRandomGenerationHint(
  generationHint: string | null | undefined,
): { readonly byteLength: number } | null {
  if (generationHint === null || generationHint === undefined) {
    return null;
  }
  const match = RANDOM_GENERATION_HINT_PATTERN.exec(generationHint.trim());
  if (match === null) {
    return null;
  }
  const byteLength = Number(match[1]);
  if (!Number.isInteger(byteLength) || byteLength < 1) {
    return null;
  }
  return { byteLength };
}

function evaluateSecretShapeMatchVerdict(input: {
  readonly text: string;
  readonly encodingClass: SecretValueEncodingClass;
  readonly generationHint: string | null | undefined;
}): SecretShapeMatchVerdict {
  const randomHint = parseRandomGenerationHint(input.generationHint);
  if (randomHint === null) {
    return "no_shape_rule";
  }
  if (input.encodingClass !== "base64-shaped") {
    return "does_not_match";
  }
  const decoded = base64UrlToBytes(input.text);
  if (decoded?.byteLength !== randomHint.byteLength) {
    return "does_not_match";
  }
  return "matches";
}

export function computeSecretWriteDescriptiveVerdicts(input: {
  readonly valueUtf8: Uint8Array;
  readonly generationHint?: string | null;
}): SecretWriteDescriptiveVerdicts {
  const valueByteLength = input.valueUtf8.byteLength;
  const text = decodeUtf8(input.valueUtf8);
  const encodingClass = classifyEncodingClass(text);

  return {
    valueByteLength,
    encodingClass,
    isEmpty: valueByteLength === 0,
    hasLeadingOrTrailingWhitespace: hasLeadingOrTrailingWhitespace(text),
    looksLikePlaceholder: looksLikePlaceholder(text),
    secretShapeMatchVerdict: evaluateSecretShapeMatchVerdict({
      text,
      encodingClass,
      generationHint: input.generationHint,
    }),
  };
}
