import {
  environmentId,
  organizationId,
  projectId,
  VALIDATION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { isAuthorizationScope } from "@insecur/access";

export interface DerivedAgentSessionPolicy {
  readonly credentialScopes?: readonly string[];
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly ttlSeconds?: number;
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), {
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
  });
}

function bodyRecord(body: unknown): Record<string, unknown> | undefined {
  return body === null || typeof body !== "object" || Array.isArray(body)
    ? undefined
    : (body as Record<string, unknown>);
}

function parseScopes(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length > 32) {
    return invalid("credentialScopes contains an unknown authorization scope.");
  }
  if (value.length === 0) {
    return invalid("credentialScopes must not be empty.");
  }
  if (!value.every((scope) => typeof scope === "string" && isAuthorizationScope(scope))) {
    return invalid("credentialScopes contains an unknown authorization scope.");
  }
  return value;
}

function parseTtlSeconds(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || Number(value) < 60 || Number(value) > 86_400) {
    return invalid("ttlSeconds must be from 60 to 86400.");
  }
  return Number(value);
}

function parseOptionalId<T>(
  value: unknown,
  parse: (raw: string) => { ok: true; value: T } | { ok: false; code: string },
  label: string,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return invalid(`${label} must be an opaque resource ID.`);
  }
  const parsed = parse(value);
  if (!parsed.ok) {
    throw Object.assign(new Error(`Invalid ${label}.`), { code: parsed.code });
  }
  return parsed.value;
}

function buildPolicy(values: {
  credentialScopes: readonly string[] | undefined;
  organizationId: OrganizationId | undefined;
  projectId: ProjectId | undefined;
  environmentId: EnvironmentId | undefined;
  ttlSeconds: number | undefined;
}): DerivedAgentSessionPolicy {
  return {
    ...(values.credentialScopes === undefined ? {} : { credentialScopes: values.credentialScopes }),
    ...(values.organizationId === undefined ? {} : { organizationId: values.organizationId }),
    ...(values.projectId === undefined ? {} : { projectId: values.projectId }),
    ...(values.environmentId === undefined ? {} : { environmentId: values.environmentId }),
    ...(values.ttlSeconds === undefined ? {} : { ttlSeconds: values.ttlSeconds }),
  };
}

export function parseDerivedAgentSessionPolicy(body: unknown): DerivedAgentSessionPolicy {
  const record = bodyRecord(body);
  if (record === undefined) {
    return {};
  }
  const credentialScopes = parseScopes(record.credentialScopes);
  const ttlSeconds = parseTtlSeconds(record.ttlSeconds);
  const organizationIdValue = parseOptionalId(
    record.organizationId,
    (raw) => organizationId.parse(raw),
    "organizationId",
  );
  const projectIdValue = parseOptionalId(
    record.projectId,
    (raw) => projectId.parse(raw),
    "projectId",
  );
  const environmentIdValue = parseOptionalId(
    record.environmentId,
    (raw) => environmentId.parse(raw),
    "environmentId",
  );
  if (environmentIdValue !== undefined && projectIdValue === undefined) {
    return invalid("environmentId requires projectId.");
  }
  if (projectIdValue !== undefined && organizationIdValue === undefined) {
    return invalid("projectId requires organizationId.");
  }
  return buildPolicy({
    credentialScopes,
    organizationId: organizationIdValue,
    projectId: projectIdValue,
    environmentId: environmentIdValue,
    ttlSeconds,
  });
}
