import { VALIDATION_ERROR_CODES, type SecretId } from "@insecur/domain";

import { parseSecretIdParam } from "./parse-route-input.js";

function parseSecretIdList(raw: string): readonly SecretId[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw Object.assign(new Error("At least one secret id is required."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return parts.map((part) => parseSecretIdParam(part));
}

export function parseSecretIdListField(
  body: Record<string, unknown>,
  field: string,
): readonly SecretId[] {
  const value = body[field];
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw Object.assign(new Error(`${field} must contain at least one secret id.`), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    return value.map((entry) => {
      if (typeof entry !== "string") {
        throw Object.assign(new Error(`${field} entries must be strings.`), {
          code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
        });
      }
      return parseSecretIdParam(entry);
    });
  }
  if (typeof value === "string") {
    return parseSecretIdList(value);
  }
  throw Object.assign(new Error(`${field} is required.`), {
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
  });
}
