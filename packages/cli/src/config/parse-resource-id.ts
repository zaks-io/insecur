import type {
  CliProfileId,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
  SecretId,
  SecretVersionId,
} from "@insecur/domain";
import {
  VALIDATION_ERROR_CODES,
  cliProfileId,
  environmentId,
  organizationId,
  projectId,
  runtimePolicyId,
  secretId,
  secretVersionId,
} from "@insecur/domain";
import { CliError } from "../output/cli-error.js";

interface ResourceIdParser<T> {
  parse: (raw: string) => { ok: true; value: T } | { ok: false };
}

function throwInvalidResourceId(label: string, context?: string): never {
  const suffix = context === undefined ? "" : ` (${context})`;
  throw new CliError({
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    message: `Invalid ${label}${suffix}.`,
    retryable: false,
  });
}

function parseRequired<T>(
  raw: string,
  parser: ResourceIdParser<T>,
  label: string,
  context?: string,
): T {
  const parsed = parser.parse(raw);
  if (!parsed.ok) {
    throwInvalidResourceId(label, context);
  }
  return parsed.value;
}

function parseOptional<T>(
  raw: string | undefined,
  parser: ResourceIdParser<T>,
  label: string,
  context?: string,
): T | undefined {
  if (raw === undefined) {
    return undefined;
  }
  return parseRequired(raw, parser, label, context);
}

export function parseOrganizationId(raw: string, context?: string): OrganizationId {
  return parseRequired(raw, organizationId, "organization id", context);
}

export function parseOptionalOrganizationId(
  raw: string | undefined,
  context?: string,
): OrganizationId | undefined {
  return parseOptional(raw, organizationId, "organization id", context);
}

export function parseProjectId(raw: string, context?: string): ProjectId {
  return parseRequired(raw, projectId, "project id", context);
}

export function parseOptionalProjectId(
  raw: string | undefined,
  context?: string,
): ProjectId | undefined {
  return parseOptional(raw, projectId, "project id", context);
}

export function parseEnvironmentId(raw: string, context?: string): EnvironmentId {
  return parseRequired(raw, environmentId, "environment id", context);
}

export function parseOptionalEnvironmentId(
  raw: string | undefined,
  context?: string,
): EnvironmentId | undefined {
  return parseOptional(raw, environmentId, "environment id", context);
}

export function parseCliProfileId(raw: string, context?: string): CliProfileId {
  return parseRequired(raw, cliProfileId, "CLI profile id", context);
}

export function parseOptionalCliProfileId(
  raw: string | undefined,
  context?: string,
): CliProfileId | undefined {
  return parseOptional(raw, cliProfileId, "CLI profile id", context);
}

export function parseOptionalRuntimePolicyId(
  raw: string | undefined,
  context?: string,
): RuntimePolicyId | undefined {
  return parseOptional(raw, runtimePolicyId, "runtime injection policy id", context);
}

export function parseRuntimePolicyId(raw: string, context?: string): RuntimePolicyId {
  return parseRequired(raw, runtimePolicyId, "runtime injection policy id", context);
}

export function parseSecretId(raw: string, context?: string): SecretId {
  return parseRequired(raw, secretId, "secret id", context);
}

export function parseSecretVersionId(raw: string, context?: string): SecretVersionId {
  return parseRequired(raw, secretVersionId, "secret version id", context);
}

export function parseSecretIds(raw: string, context?: string): readonly SecretId[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "At least one secret id is required in --secret-ids.",
      retryable: false,
    });
  }
  return parts.map((part) => parseRequired(part, secretId, "secret id", context));
}
