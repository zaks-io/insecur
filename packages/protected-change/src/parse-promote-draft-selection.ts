import { APPROVAL_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { SecretId, SecretVersionId } from "@insecur/domain";

const WILDCARD_SELECTION_TOKENS = new Set([
  "*",
  "all",
  "all-staged",
  "all_staged",
  "staged",
  "wildcard",
]);

export interface ParsedPromoteDraftSelection {
  readonly draftVersionIds: readonly SecretVersionId[];
  readonly secretIds: readonly SecretId[];
}

function isWildcardToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return WILDCARD_SELECTION_TOKENS.has(normalized) || normalized.includes("*");
}

export function parsePromoteDraftSelection(rawIds: readonly string[]): ParsedPromoteDraftSelection {
  if (rawIds.length === 0) {
    throw Object.assign(new Error("At least one draft version id is required."), {
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
    });
  }

  for (const raw of rawIds) {
    if (isWildcardToken(raw)) {
      throw Object.assign(new Error("Wildcard or all-staged draft selection is not supported."), {
        code: APPROVAL_ERROR_CODES.wildcardSelectionRejected,
      });
    }
  }

  const draftVersionIds: SecretVersionId[] = [];
  const secretIds = new Set<SecretId>();

  for (const raw of rawIds) {
    if (!raw.startsWith("sv_")) {
      throw Object.assign(new Error("Invalid draft version id."), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    draftVersionIds.push(raw as SecretVersionId);
  }

  return { draftVersionIds, secretIds: [...secretIds] };
}
