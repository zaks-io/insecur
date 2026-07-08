import {
  includesExactBindingPatternMarker,
  parseOpaqueResourceId,
  secretId,
  type SecretId,
} from "@insecur/domain";

import { SecretSyncError } from "./secret-sync-error.js";
import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";

export interface SecretSyncBindingInput {
  readonly secretId: string;
  readonly providerDestination: string;
}

export interface ValidatedSecretSyncBindingInput {
  readonly secretId: SecretId;
  readonly providerDestination: string;
}

function rejectPatternBinding(raw: string, kind: "secret_id" | "provider_destination"): never {
  throw new SecretSyncError(
    SECRET_SYNC_ERROR_CODES.patternBindingRejected,
    `secret sync rejects pattern-based ${kind} binding`,
  );
}

function assertNoPatternMarkers(raw: string, kind: "secret_id" | "provider_destination"): void {
  if (includesExactBindingPatternMarker(raw)) {
    rejectPatternBinding(raw, kind);
  }
}

function parseExactSecretId(raw: string): SecretId {
  assertNoPatternMarkers(raw, "secret_id");
  const parsed = parseOpaqueResourceId(raw, "sec");
  if (!parsed.ok) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidBindings,
      "secret sync binding must reference an exact secret id",
    );
  }
  return secretId.brand(parsed.value);
}

function parseExactProviderDestination(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "secret sync binding requires an exact provider destination",
    );
  }
  assertNoPatternMarkers(trimmed, "provider_destination");
  return trimmed;
}

function validateBindingUniqueness(
  secretIdValue: SecretId,
  providerDestination: string,
  seenSecretIds: Set<string>,
  seenDestinations: Set<string>,
): void {
  if (seenSecretIds.has(secretIdValue)) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidBindings,
      "secret sync secret bindings must be unique",
    );
  }
  if (seenDestinations.has(providerDestination)) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidBindings,
      "secret sync provider destinations must be unique within a sync",
    );
  }
}

export function validateSecretSyncBindings(
  bindings: readonly SecretSyncBindingInput[],
): readonly ValidatedSecretSyncBindingInput[] {
  if (bindings.length === 0) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidBindings,
      "secret sync requires at least one exact binding",
    );
  }

  const validated: ValidatedSecretSyncBindingInput[] = [];
  const seenSecretIds = new Set<string>();
  const seenDestinations = new Set<string>();

  for (const binding of bindings) {
    const secretIdValue = parseExactSecretId(binding.secretId);
    const providerDestination = parseExactProviderDestination(binding.providerDestination);
    validateBindingUniqueness(secretIdValue, providerDestination, seenSecretIds, seenDestinations);
    seenSecretIds.add(secretIdValue);
    seenDestinations.add(providerDestination);
    validated.push({ secretId: secretIdValue, providerDestination });
  }

  return validated;
}
