import type {
  OperatorOrganizationResourceIds,
  ProvisionGuidedOrganizationResourceIds,
} from "@insecur/onboarding";
import {
  VALIDATION_ERROR_CODES,
  environmentId,
  membershipId,
  organizationId,
  projectId,
  teamId,
} from "@insecur/domain";
import { readRequiredString } from "./parse-route-input.js";

type ParseResult<T> = { ok: true; value: T } | { ok: false; code: string };

const parseOrganizationResourceId = (raw: string) => organizationId.parse(raw);
const parseTeamResourceId = (raw: string) => teamId.parse(raw);
const parseMembershipResourceId = (raw: string) => membershipId.parse(raw);
const parseProjectResourceId = (raw: string) => projectId.parse(raw);
const parseEnvironmentResourceId = (raw: string) => environmentId.parse(raw);

function throwResourceIdsError(): never {
  throw Object.assign(new Error("Invalid resourceIds."), {
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
  });
}

function parseRequiredResourceId<T>(
  record: Record<string, unknown>,
  field: string,
  parser: (raw: string) => ParseResult<T>,
): T {
  const parsed = parser(readRequiredString(record, field));
  if (!parsed.ok) {
    throwResourceIdsError();
  }
  return parsed.value;
}

function readResourceIdsObject(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = body.resourceIds;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throwResourceIdsError();
  }
  return raw as Record<string, unknown>;
}

export function parseGuidedOrganizationResourceIds(
  body: Record<string, unknown>,
): ProvisionGuidedOrganizationResourceIds | undefined {
  const record = readResourceIdsObject(body);
  if (record === undefined) {
    return undefined;
  }
  return {
    organizationId: parseRequiredResourceId(record, "organizationId", parseOrganizationResourceId),
    defaultTeamId: parseRequiredResourceId(record, "defaultTeamId", parseTeamResourceId),
    ownerMembershipId: parseRequiredResourceId(
      record,
      "ownerMembershipId",
      parseMembershipResourceId,
    ),
    projectId: parseRequiredResourceId(record, "projectId", parseProjectResourceId),
    developmentEnvironmentId: parseRequiredResourceId(
      record,
      "developmentEnvironmentId",
      parseEnvironmentResourceId,
    ),
  };
}

export function parseOperatorOrganizationResourceIds(
  body: Record<string, unknown>,
): OperatorOrganizationResourceIds | undefined {
  const record = readResourceIdsObject(body);
  if (record === undefined) {
    return undefined;
  }
  return {
    organizationId: parseRequiredResourceId(record, "organizationId", parseOrganizationResourceId),
    defaultTeamId: parseRequiredResourceId(record, "defaultTeamId", parseTeamResourceId),
  };
}
