import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";

import { assertEqual, asRecord, requireString, type JsonRecord } from "./http.js";
import { parseLastCliSmokeJson } from "./cli-smoke.js";

/** Asserts a successful `insecur operations get`/`operations wait` envelope and returns its data. */
export function assertCliOperationPollMetadataOnly(body: JsonRecord, label: string): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  requireString(data.operationId, `${label} data.operationId`);
  requireString(data.organizationId, `${label} data.organizationId`);
  requireString(data.state, `${label} data.state`);
  requireString(data.intentCode, `${label} data.intentCode`);
  requireString(data.createdAt, `${label} data.createdAt`);
  requireString(data.updatedAt, `${label} data.updatedAt`);
  asRecord(data.progress, `${label} data.progress`);
  return data;
}

/** Asserts a successful `insecur run-policies create` envelope and returns its data. */
export function assertCliRunPolicyCreateMetadataOnly(body: JsonRecord, label: string): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  requireString(data.policyId, `${label} data.policyId`);
  requireString(data.policyVersionId, `${label} data.policyVersionId`);
  requireString(data.displayName, `${label} data.displayName`);
  requireString(data.auditEventId, `${label} data.auditEventId`);
  const activeVersion = asRecord(data.activeVersion, `${label} data.activeVersion`);
  requireString(activeVersion.policyVersionId, `${label} data.activeVersion.policyVersionId`);
  requireString(activeVersion.command, `${label} data.activeVersion.command`);
  if (!Array.isArray(activeVersion.secretIds)) {
    throw new Error(`${label} data.activeVersion.secretIds must be an array`);
  }
  return data;
}

/** Asserts a successful `insecur run-policies show` envelope and returns its data. */
export function assertCliRunPolicyShowMetadataOnly(body: JsonRecord, label: string): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  requireString(data.policyId, `${label} data.policyId`);
  requireString(data.organizationId, `${label} data.organizationId`);
  requireString(data.projectId, `${label} data.projectId`);
  requireString(data.environmentId, `${label} data.environmentId`);
  requireString(data.displayName, `${label} data.displayName`);
  requireString(data.createdAt, `${label} data.createdAt`);
  return data;
}

/** Asserts a successful `insecur run-policies disable` envelope and returns its data. */
export function assertCliRunPolicyDisableMetadataOnly(body: JsonRecord, label: string): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  const data = asRecord(body.data, `${label} data`);
  requireString(data.policyId, `${label} data.policyId`);
  requireString(data.disabledAt, `${label} data.disabledAt`);
  requireString(data.auditEventId, `${label} data.auditEventId`);
  return data;
}

/**
 * Parses a CLI error envelope written to stderr under `--json` (see
 * `renderEnvelope`/`renderError`, which never write error JSON to stdout) and
 * asserts it carries the expected stable error code plus, when present, a
 * metadata-only remediation payload.
 */
export function assertCliErrorEnvelope(input: {
  readonly exitCode: number;
  readonly expectedExitCode: number;
  readonly expectedErrorCode: string;
  readonly label: string;
  readonly stderr: string;
  readonly stdout: string;
}): JsonRecord {
  if (input.exitCode !== input.expectedExitCode) {
    throw new Error(
      `${input.label} expected exit code ${String(input.expectedExitCode)}, got ${String(input.exitCode)}`,
    );
  }
  if (input.stdout.trim() !== "") {
    throw new Error(`${input.label} must not write success JSON to stdout on failure`);
  }
  const body = parseLastCliSmokeJson(input.stderr, input.label);
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, false, `${input.label} ok`);
  const error = asRecord(body.error, `${input.label} error`);
  assertEqual(error.code, input.expectedErrorCode, `${input.label} error.code`);
  return body;
}
