import {
  AUTH_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  OPERATION_ERROR_CODES,
  environmentId,
  runtimePolicyId,
} from "@insecur/domain";

import { withServiceRoleSql } from "./audit-verification-db.js";
import { authHeaders } from "./auth.js";
import { assertDeniedBodyFreeOfSensitiveValues } from "./denied-response.js";
import {
  assertEnvelopeError,
  assertEqual,
  assertStatus,
  asRecord,
  collectOperationId,
  readJsonResponse,
  requireString,
  type JsonRecord,
} from "./http.js";
import { assertResponseFreeOfRedactedPatterns } from "./metadata-read-assertions.js";

const RUNTIME_INJECTION_POLICY_CHANGE_INTENT = "runtime_injection_policy.change";

export interface ProvisionProtectedSmokeEnvironmentInput {
  databaseUrl: string;
  environmentId: string;
  organizationId: string;
  projectId: string;
}

export interface RequestRunPolicyOperationHandoffInput {
  apiBaseUrl: string;
  bearer: string;
  command?: string;
  environmentId: string;
  organizationId: string;
  policyId: string;
  projectId: string;
  redactor: (value: unknown) => string;
  secretId: string;
}

export interface AssertOperationPollEnvelopeInput {
  data: JsonRecord;
  operationId: string;
  organizationId: string;
  redactor: (value: unknown) => string;
}

export interface AssertCrossOrganizationOperationPollDeniedInput {
  apiBaseUrl: string;
  bearer: string;
  operationId: string;
  otherOrganizationId: string;
  redactor: (value: unknown) => string;
}

/**
 * Smoke-only setup: inserts a protected preview environment so the product run-policy path can
 * create a bounded operation via high-assurance handoff.
 */
export async function provisionProtectedSmokeEnvironment(
  input: ProvisionProtectedSmokeEnvironmentInput,
): Promise<void> {
  await withServiceRoleSql(input.databaseUrl, async (sql) => {
    await sql`
      INSERT INTO environments (
        id,
        org_id,
        project_id,
        display_name,
        is_protected,
        lifecycle_stage
      )
      VALUES (
        ${input.environmentId},
        ${input.organizationId},
        ${input.projectId},
        ${"Smoke preview protected"},
        ${true},
        ${ENVIRONMENT_LIFECYCLE_STAGES.preview}
      )
      ON CONFLICT (org_id, id) DO NOTHING
    `;
  });
}

export function mintProtectedEnvironmentId(): string {
  return environmentId.generate();
}

export function mintRunPolicyId(): string {
  return runtimePolicyId.generate();
}

/**
 * Protected run-policy create fails closed with auth.high_assurance_required and a bounded operation
 * id in meta.operationId — the narrowest live preview path that emits a real operation record.
 */
export async function requestRunPolicyOperationHandoff(
  input: RequestRunPolicyOperationHandoffInput,
): Promise<string> {
  const url = `${input.apiBaseUrl}/v1/orgs/${input.organizationId}/run-policies`;
  const response = await fetch(url, {
    body: JSON.stringify({
      command: input.command ?? "npm run smoke",
      displayName: "smoke-policy",
      environmentId: input.environmentId,
      policyId: input.policyId,
      projectId: input.projectId,
      secretIds: [input.secretId],
    }),
    headers: { ...authHeaders(input.bearer), "Content-Type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  assertStatus(response, 401, "Protected run-policy handoff", {
    bodyText: text,
    redactor: input.redactor,
  });
  const body = await readJsonResponse(response, "Protected run-policy handoff", text);
  assertEnvelopeError(body, AUTH_ERROR_CODES.highAssuranceRequired, "Protected run-policy handoff");
  assertDeniedBodyFreeOfSensitiveValues(text, input.redactor, "Protected run-policy handoff");

  const operationId = collectOperationId(body);
  if (operationId === undefined) {
    throw new Error("Protected run-policy handoff did not return an operation id.");
  }
  return operationId;
}

export function assertOperationPollEnvelope(input: AssertOperationPollEnvelopeInput): void {
  assertEqual(input.data.operationId, input.operationId, "Operation poll operationId");
  assertEqual(input.data.organizationId, input.organizationId, "Operation poll organizationId");
  requireString(input.data.state, "Operation poll state");
  assertEqual(
    input.data.intentCode,
    RUNTIME_INJECTION_POLICY_CHANGE_INTENT,
    "Operation poll intentCode",
  );
  requireString(input.data.createdAt, "Operation poll createdAt");
  requireString(input.data.updatedAt, "Operation poll updatedAt");
  asRecord(input.data.progress, "Operation poll progress");
  assertResponseFreeOfRedactedPatterns(input.redactor, input.data, "Operation poll data");
}

export async function assertCrossOrganizationOperationPollDenied(
  input: AssertCrossOrganizationOperationPollDeniedInput,
): Promise<void> {
  const url = `${input.apiBaseUrl}/v1/orgs/${input.otherOrganizationId}/operations/${input.operationId}`;
  const response = await fetch(url, {
    headers: authHeaders(input.bearer),
    method: "GET",
  });
  const text = await response.text();
  assertStatus(response, 404, "Cross-organization operation poll", {
    bodyText: text,
    redactor: input.redactor,
  });
  const body = await readJsonResponse(response, "Cross-organization operation poll", text);
  assertEnvelopeError(body, OPERATION_ERROR_CODES.notFound, "Cross-organization operation poll");
  assertDeniedBodyFreeOfSensitiveValues(text, input.redactor, "Cross-organization operation poll");
}
