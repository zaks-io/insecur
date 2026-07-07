import {
  VALIDATION_ERROR_CODES,
  environmentId,
  injectionGrantId,
  invitationId,
  membershipId,
  operationId,
  organizationId,
  parseDisplayName,
  parseVariableKey,
  projectId,
  requestId,
  runtimePolicyId,
  secretId,
  userId,
  type DisplayName,
  type EnvironmentId,
  type InjectionGrantId,
  type InvitationId,
  type MembershipId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type RuntimePolicyId,
  type SecretId,
  type UserId,
} from "@insecur/domain";

export {
  parseGuidedOrganizationResourceIds,
  parseOperatorOrganizationResourceIds,
} from "./parse-route-resource-ids.js";

function throwParseError(message: string, code: string): never {
  throw Object.assign(new Error(message), { code });
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; code: string };

const parseOrganizationResourceId = (raw: string) => organizationId.parse(raw);
const parseProjectResourceId = (raw: string) => projectId.parse(raw);
const parseEnvironmentResourceId = (raw: string) => environmentId.parse(raw);
const parseGrantResourceId = (raw: string) => injectionGrantId.parse(raw);
const parseOperationResourceId = (raw: string) => operationId.parse(raw);
const parseRequestResourceId = (raw: string) => requestId.parse(raw);
const parseInvitationResourceId = (raw: string) => invitationId.parse(raw);
const parseUserResourceId = (raw: string) => userId.parse(raw);
const parseSecretResourceId = (raw: string) => secretId.parse(raw);
const parseMembershipResourceId = (raw: string) => membershipId.parse(raw);

function parseValue<T>(raw: string, parser: (raw: string) => ParseResult<T>, message: string): T {
  const parsed = parser(raw);
  if (!parsed.ok) {
    throwParseError(message, parsed.code);
  }
  return parsed.value;
}

function parseOptionalValue<T>(
  raw: string | undefined,
  parser: (raw: string) => ParseResult<T>,
  message: string,
): T | undefined {
  return raw === undefined ? undefined : parseValue(raw, parser, message);
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
  return parseValue(raw, parseOrganizationResourceId, "Invalid organization id.");
}

export function parseProjectIdParam(raw: string): ProjectId {
  return parseValue(raw, parseProjectResourceId, "Invalid project id.");
}

export function parseEnvironmentIdParam(raw: string): EnvironmentId {
  return parseValue(raw, parseEnvironmentResourceId, "Invalid environment id.");
}

export function parseGrantIdParam(raw: string): InjectionGrantId {
  return parseValue(raw, parseGrantResourceId, "Invalid injection grant id.");
}

export function parseOperationIdParam(raw: string): OperationId {
  return parseValue(raw, parseOperationResourceId, "Invalid operation id.");
}

export function parseRequestIdParam(raw: string): RequestId {
  return parseValue(raw, parseRequestResourceId, "Invalid request id.");
}

export function parseInvitationIdParam(raw: string): InvitationId {
  return parseValue(raw, parseInvitationResourceId, "Invalid invitation id.");
}

export function parseUserIdField(raw: string): UserId {
  return parseValue(raw, parseUserResourceId, "Invalid user id.");
}

export function parseVariableKeyField(raw: string) {
  return parseValue(raw, parseVariableKey, "Invalid variable key.");
}

export function parseOptionalSecretId(raw: string | undefined): SecretId | undefined {
  return parseOptionalValue(raw, parseSecretResourceId, "Invalid secret id.");
}

export function parseOptionalMembershipId(raw: string | undefined): MembershipId | undefined {
  return parseOptionalValue(raw, parseMembershipResourceId, "Invalid membership id.");
}

export function parseOptionalInvitationId(raw: string | undefined): InvitationId | undefined {
  return parseOptionalValue(raw, parseInvitationResourceId, "Invalid invitation id.");
}

export function parseRequiredDisplayName(raw: string): DisplayName {
  const parsed = parseOptionalDisplayName(raw);
  if (parsed === undefined) {
    throw Object.assign(new Error("Invalid display name."), {
      code: VALIDATION_ERROR_CODES.invalidDisplayName,
    });
  }
  return parsed;
}

export function parseOptionalDisplayName(raw: string | undefined): DisplayName | undefined {
  return parseOptionalValue(raw, parseDisplayName, "Invalid display name.");
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

export function parseOwnerMembershipId(body: Record<string, unknown>): MembershipId {
  return parseValue(
    readRequiredString(body, "ownerMembershipId"),
    parseMembershipResourceId,
    "Invalid owner membership id.",
  );
}

export function encodeRequestValueUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

type InjectionGrantSelectorInput =
  | { kind: "variable_key"; variableKey: ReturnType<typeof parseVariableKeyField> }
  | { kind: "secret_id"; secretId: SecretId };

export type InjectionGrantIssueSelectorInput =
  InjectionGrantSelectorInput | { kind: "policy_id"; policyId: RuntimePolicyId };

export type InjectionGrantConsumeSelectorInput = InjectionGrantSelectorInput;

function hasOwnField(body: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function parseSingleInjectionGrantSelector(
  body: Record<string, unknown>,
): InjectionGrantSelectorInput {
  const hasVariableKey = hasOwnField(body, "variableKey");
  const hasSecretId = hasOwnField(body, "secretId");

  if (hasVariableKey === hasSecretId) {
    throw Object.assign(new Error("Exactly one of variableKey or secretId is required."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }

  if (hasSecretId) {
    const secretIdRaw = readOptionalString(body, "secretId");
    const parsedSecretId = parseOptionalSecretId(secretIdRaw);
    if (parsedSecretId === undefined) {
      throw Object.assign(new Error("Invalid secret id."), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    return { kind: "secret_id", secretId: parsedSecretId };
  }

  const variableKeyRaw = readOptionalString(body, "variableKey");
  return { kind: "variable_key", variableKey: parseVariableKeyField(variableKeyRaw ?? "") };
}

export function parseInjectionGrantIssueSelector(
  body: Record<string, unknown>,
): InjectionGrantIssueSelectorInput {
  const hasVariableKey = hasOwnField(body, "variableKey");
  const hasSecretId = hasOwnField(body, "secretId");
  const hasPolicyId = hasOwnField(body, "policyId");
  const selectorCount = [hasVariableKey, hasSecretId, hasPolicyId].filter(Boolean).length;
  if (selectorCount !== 1) {
    throw Object.assign(
      new Error("Exactly one of variableKey, secretId, or policyId is required."),
      {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      },
    );
  }
  if (hasPolicyId) {
    const policyIdRaw = readRequiredString(body, "policyId");
    const parsedPolicyId = runtimePolicyId.parse(policyIdRaw);
    if (!parsedPolicyId.ok) {
      throw Object.assign(new Error("Invalid runtime injection policy id."), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    return { kind: "policy_id", policyId: parsedPolicyId.value };
  }
  return parseSingleInjectionGrantSelector(body);
}

export function parseInjectionGrantConsumeSelector(
  body: Record<string, unknown>,
): InjectionGrantConsumeSelectorInput {
  return parseSingleInjectionGrantSelector(body);
}
