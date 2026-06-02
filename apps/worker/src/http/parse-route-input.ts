import type { ProvisionGuidedOrganizationResourceIds } from "@insecur/onboarding";
import {
  VALIDATION_ERROR_CODES,
  environmentId,
  injectionGrantId,
  membershipId,
  organizationId,
  parseDisplayName,
  parseVariableKey,
  projectId,
  secretId,
  teamId,
  type DisplayName,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
} from "@insecur/domain";

function throwParseError(message: string, code: string): never {
  throw Object.assign(new Error(message), { code });
}

export function requireRouteParam(value: string | undefined, label: string): string {
  if (value === undefined || value === "") {
    throw Object.assign(new Error(`Missing route parameter: ${label}.`), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return value;
}

export function parseOrganizationIdParam(raw: string): OrganizationId {
  const parsed = organizationId.parse(raw);
  if (!parsed.ok) {
    throwParseError("Invalid organization id.", parsed.code);
  }
  return parsed.value;
}

export function parseProjectIdParam(raw: string): ProjectId {
  const parsed = projectId.parse(raw);
  if (!parsed.ok) {
    throwParseError("Invalid project id.", parsed.code);
  }
  return parsed.value;
}

export function parseEnvironmentIdParam(raw: string): EnvironmentId {
  const parsed = environmentId.parse(raw);
  if (!parsed.ok) {
    throwParseError("Invalid environment id.", parsed.code);
  }
  return parsed.value;
}

export function parseGrantIdParam(raw: string): InjectionGrantId {
  const parsed = injectionGrantId.parse(raw);
  if (!parsed.ok) {
    throwParseError("Invalid injection grant id.", parsed.code);
  }
  return parsed.value;
}

export function parseVariableKeyField(raw: string) {
  const parsed = parseVariableKey(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid variable key."), {
      code: parsed.code,
    });
  }
  return parsed.value;
}

export function parseOptionalSecretId(raw: string | undefined): SecretId | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = secretId.parse(raw);
  if (!parsed.ok) {
    throwParseError("Invalid secret id.", parsed.code);
  }
  return parsed.value;
}

export function parseOptionalDisplayName(raw: string | undefined): DisplayName | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid display name."), {
      code: parsed.code,
    });
  }
  return parsed.value;
}

export function parseJsonBody(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw Object.assign(new Error("Request body must be a JSON object."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return raw as Record<string, unknown>;
}

export function readRequiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw Object.assign(new Error(`Missing required field: ${field}.`), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return value;
}

export function readOptionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw Object.assign(new Error(`Invalid field: ${field}.`), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return value;
}

export function readSecretValueField(body: Record<string, unknown>): string {
  const value = body.value;
  if (typeof value !== "string") {
    throw Object.assign(new Error("Missing required field: value."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return value;
}

export function readOptionalBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw Object.assign(new Error(`Invalid field: ${field}.`), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return value;
}

export function encodeRequestValueUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function parseRequiredBrandedId<T>(
  record: Record<string, unknown>,
  field: string,
  parser: { parse: (raw: string) => { ok: true; value: T } | { ok: false } },
): T {
  const parsed = parser.parse(readRequiredString(record, field));
  if (!parsed.ok) {
    throwParseError("Invalid resourceIds.", VALIDATION_ERROR_CODES.invalidOpaqueResourceId);
  }
  return parsed.value;
}

export function parseGuidedOrganizationResourceIds(
  body: Record<string, unknown>,
): ProvisionGuidedOrganizationResourceIds | undefined {
  const raw = body.resourceIds;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throwParseError("Invalid resourceIds.", VALIDATION_ERROR_CODES.invalidOpaqueResourceId);
  }
  const record = raw as Record<string, unknown>;
  return {
    organizationId: parseRequiredBrandedId(record, "organizationId", organizationId),
    defaultTeamId: parseRequiredBrandedId(record, "defaultTeamId", teamId),
    ownerMembershipId: parseRequiredBrandedId(record, "ownerMembershipId", membershipId),
    projectId: parseRequiredBrandedId(record, "projectId", projectId),
    developmentEnvironmentId: parseRequiredBrandedId(
      record,
      "developmentEnvironmentId",
      environmentId,
    ),
  };
}
