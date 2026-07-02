import {
  isStableDottedCode,
  parseOpaqueResourceId,
  STABLE_DOTTED_CODE_MAX_LENGTH,
  type OpaqueResourceIdPrefix,
} from "@insecur/domain";

import { InvalidAadFieldError } from "./errors.js";

/** Connection method codes (for example `github-app`, `vercel-integration-oauth`). */
const PROVIDER_CONNECTION_METHOD_PATTERN = /^[a-z][a-z0-9_-]+$/;
const PROVIDER_CONNECTION_METHOD_MAX_LENGTH = 64;

/** Sensitive Metadata field keys (for example `body`, `target_name`). */
const SENSITIVE_METADATA_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]+$/;
const SENSITIVE_METADATA_FIELD_KEY_MAX_LENGTH = 64;

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 0x00 && code <= 0x1f) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function assertNoControlCharacters(value: string, field: string): void {
  if (hasControlCharacters(value)) {
    throw new InvalidAadFieldError(field);
  }
}

export function assertProviderConnectionMethodForAad(value: string): void {
  assertNoControlCharacters(value, "provider");
  if (
    value.length > PROVIDER_CONNECTION_METHOD_MAX_LENGTH ||
    !PROVIDER_CONNECTION_METHOD_PATTERN.test(value)
  ) {
    throw new InvalidAadFieldError("provider");
  }
}

export function assertSensitiveMetadataTypeForAad(value: string): void {
  assertNoControlCharacters(value, "metadataType");
  if (!isStableDottedCode(value) || value.length > STABLE_DOTTED_CODE_MAX_LENGTH) {
    throw new InvalidAadFieldError("metadataType");
  }
}

export function assertSensitiveMetadataFieldKeyForAad(value: string): void {
  assertNoControlCharacters(value, "fieldKey");
  if (
    value.length > SENSITIVE_METADATA_FIELD_KEY_MAX_LENGTH ||
    !SENSITIVE_METADATA_FIELD_KEY_PATTERN.test(value)
  ) {
    throw new InvalidAadFieldError("fieldKey");
  }
}

export function assertOpaqueResourceIdForAad(value: string): void {
  if (!parseOpaqueResourceId(value).ok) {
    throw new InvalidAadFieldError("recordResourceId");
  }
}

export function assertOpaqueResourceIdFieldForAad(
  value: string,
  expectedPrefix: OpaqueResourceIdPrefix,
  field: string,
): void {
  if (!parseOpaqueResourceId(value, expectedPrefix).ok) {
    throw new InvalidAadFieldError(field);
  }
}
