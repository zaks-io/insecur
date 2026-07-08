import { AUTH_ERROR_CODES, assertMetadataOnlyEnvelopeShape } from "@insecur/domain";

import type { PreviewConfig } from "./env.js";
import { assertEqual, asRecord, requireString, type JsonRecord } from "./http.js";
import { requireObjectArray } from "./metadata-read-assertions.js";
import { parseCliSmokeJson } from "./cli-smoke.js";

const FORBIDDEN_OUTPUT_KEYS = [
  "credential",
  "token",
  "password",
  "value",
  "secret",
  "plaintext",
] as const;

export const CLI_AUTH_REQUIRED_EXIT_CODE = 3;

function assertCliOutputMetadataOnly(value: unknown, label: string): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of FORBIDDEN_OUTPUT_KEYS) {
    if (serialized.includes(`"${forbidden}"`)) {
      throw new Error(`${label} leaked forbidden metadata key ${forbidden}`);
    }
  }
}

export function assertCliWhoamiSuccess(
  body: JsonRecord,
  preview: PreviewConfig,
  options: {
    readonly label?: string;
    readonly organizationId?: string;
    readonly projectId?: string;
    readonly environmentId?: string;
  } = {},
): JsonRecord {
  const label = options.label ?? "CLI whoami";
  const data = assertCliSuccessData(body, label);
  assertCliActorIdentity(data, preview, label);
  assertCliResolvedScope(data, label, options);
  return data;
}

export function assertCliNavigationListSuccess(
  body: JsonRecord,
  label: string,
  listKey: "organizations" | "projects" | "environments",
): JsonRecord[] {
  const data = assertCliSuccessData(body, label);
  const list = data[listKey];
  return requireObjectArray(list, `${label} ${listKey}`);
}

export function assertCliConfigShowSuccess(
  body: JsonRecord,
  label: string,
  scope: {
    readonly host: string;
    readonly organizationId: string;
    readonly projectId: string;
    readonly environmentId: string;
  },
): JsonRecord {
  const data = assertCliSuccessData(body, label);
  assertEqual(data.host, scope.host, `${label} host`);
  assertEqual(data.orgId, scope.organizationId, `${label} orgId`);
  assertEqual(data.projectId, scope.projectId, `${label} projectId`);
  assertEqual(data.envId, scope.environmentId, `${label} envId`);
  requireString(data.projectConfigPath, `${label} projectConfigPath`);
  const profiles = requireObjectArray(data.profiles, `${label} profiles`);
  if (profiles.length === 0) {
    throw new Error(`${label} must include at least one profile`);
  }
  return data;
}

export function assertCliLogoutSuccess(body: JsonRecord, label: string): void {
  const data = assertCliSuccessData(body, label);
  assertEqual(data.revokeAttempted, true, `${label} revokeAttempted`);
  assertEqual(data.revoked, true, `${label} revoked`);
}

function parseCliSmokeError(stderr: string, label: string): JsonRecord {
  const trimmed = stderr.trim();
  if (trimmed === "") {
    throw new Error(`${label} produced no JSON error output on stderr`);
  }
  return parseCliSmokeJson(trimmed, label);
}

export function assertCliAuthFailure(input: {
  readonly exitCode: number;
  readonly label: string;
  readonly stderr: string;
  readonly stdout: string;
}): void {
  if (input.exitCode !== CLI_AUTH_REQUIRED_EXIT_CODE) {
    throw new Error(
      `${input.label} expected exit code ${String(CLI_AUTH_REQUIRED_EXIT_CODE)}, got ${String(input.exitCode)}`,
    );
  }
  if (input.stdout.trim() !== "") {
    throw new Error(`${input.label} must not write success JSON to stdout after auth failure`);
  }

  const body = parseCliSmokeError(input.stderr, input.label);
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, false, `${input.label} ok`);
  const error = asRecord(body.error, `${input.label} error`);
  const code = requireString(error.code, `${input.label} error.code`);
  if (code !== AUTH_ERROR_CODES.invalid && code !== AUTH_ERROR_CODES.required) {
    throw new Error(
      `${input.label} expected ${AUTH_ERROR_CODES.invalid} or ${AUTH_ERROR_CODES.required}, got ${code}`,
    );
  }
  if (body.remediation !== undefined) {
    assertCliOutputMetadataOnly(body.remediation, `${input.label} remediation`);
  }
}

function assertCliSuccessData(body: JsonRecord, label: string): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  assertCliOutputMetadataOnly(data, label);
  return data;
}

function assertCliActorIdentity(data: JsonRecord, preview: PreviewConfig, label: string): void {
  assertEqual(data.actorType, "user", `${label} actorType`);
  assertEqual(data.userId, preview.ownerUserId, `${label} userId`);
  requireString(data.sessionId, `${label} sessionId`);
  assertEqual(data.sessionValid, true, `${label} sessionValid`);
  requireString(data.sessionExpiresAt, `${label} sessionExpiresAt`);
}

function assertCliResolvedScope(
  data: JsonRecord,
  label: string,
  options: {
    readonly organizationId?: string;
    readonly projectId?: string;
    readonly environmentId?: string;
  },
): void {
  const resolvedContext = asRecord(data.resolvedContext, `${label} resolvedContext`);
  if (options.organizationId !== undefined) {
    assertEqual(
      resolvedContext.organizationId,
      options.organizationId,
      `${label} resolvedContext.organizationId`,
    );
  }
  if (options.projectId !== undefined) {
    assertEqual(resolvedContext.projectId, options.projectId, `${label} resolvedContext.projectId`);
  }
  if (options.environmentId !== undefined) {
    assertEqual(
      resolvedContext.environmentId,
      options.environmentId,
      `${label} resolvedContext.environmentId`,
    );
  }
}
