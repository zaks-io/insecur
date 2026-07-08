import { VALIDATION_ERROR_CODES, type SecretVersionId } from "@insecur/domain";

import { parseSecretVersionIdParam } from "./parse-route-input.js";

function parseSecretVersionIdList(raw: string): readonly SecretVersionId[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw Object.assign(new Error("At least one draft version id is required."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return parts.map((part) => parseSecretVersionIdParam(part));
}

export function parseSecretVersionIdListField(
  body: Record<string, unknown>,
  field: string,
): readonly SecretVersionId[] {
  const value = body[field];
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw Object.assign(new Error(`${field} must contain at least one draft version id.`), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    return value.map((entry) => {
      if (typeof entry !== "string") {
        throw Object.assign(new Error(`${field} entries must be strings.`), {
          code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
        });
      }
      return parseSecretVersionIdParam(entry);
    });
  }
  if (typeof value === "string") {
    return parseSecretVersionIdList(value);
  }
  throw Object.assign(new Error(`${field} is required.`), {
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
  });
}
