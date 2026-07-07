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
  type SecretId,
  type UserId,
} from "@insecur/domain";

import { parseOptionalValue, parseValue } from "./parse-route-input-shared.js";

export { parseWebhookSubscriptionIdParam } from "./parse-webhook-route-input.js";
export {
  parseInjectionGrantConsumeSelector,
  parseInjectionGrantIssueSelector,
  type InjectionGrantConsumeSelectorInput,
  type InjectionGrantIssueSelectorInput,
} from "./parse-injection-grant-route-input.js";
export {
  parseGuidedOrganizationResourceIds,
  parseOperatorOrganizationResourceIds,
} from "./parse-route-resource-ids.js";

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

export function parseSecretIdParam(raw: string): SecretId {
  return parseValue(raw, parseSecretResourceId, "Invalid secret id.");
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
