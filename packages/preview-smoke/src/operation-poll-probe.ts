import { AUTH_ERROR_CODES, operationId } from "@insecur/domain";

import { withServiceRoleSql } from "./audit-verification-db.js";
import { authHeaders } from "./auth.js";
import { assertDeniedBodyFreeOfSensitiveValues } from "./denied-response.js";
import {
  assertEnvelopeError,
  assertEqual,
  assertStatus,
  asRecord,
  readJsonResponse,
  requireString,
  type JsonRecord,
} from "./http.js";
import { assertResponseFreeOfRedactedPatterns } from "./metadata-read-assertions.js";

/**
 * Preview smoke operation-poll harness (INS-358).
 *
 * No smoke-reachable HTTP route on preview currently mints `sync.run`, `provider.reauth`, or
 * `backup.export` operations. This harness seeds a tenant-qualified operations row via
 * service-role SQL using a registered intent code, then proves the mounted product poll route:
 * `GET /v1/orgs/:organizationId/operations/:operationId`.
 */
export const SMOKE_OPERATION_POLL_INTENT = "sync.run" as const;

export const SMOKE_OPERATION_POLL_TERMINAL_STATE = "succeeded" as const;

export interface ProvisionSmokeOperationForPollInput {
  databaseUrl: string;
  intentCode?: string;
  operationId: string;
  organizationId: string;
  state?: string;
}

export interface AssertOperationPollEnvelopeInput {
  data: JsonRecord;
  expectedIntentCode?: string;
  expectedState?: string;
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

export function mintSmokeOperationId(): string {
  return operationId.generate();
}

/**
 * Smoke-only mint: inserts a metadata-safe operations row with a registered intent so the poll
 * route can be exercised against live preview Workers + Postgres.
 */
export async function provisionSmokeOperationForPoll(
  input: ProvisionSmokeOperationForPollInput,
): Promise<void> {
  const intentCode = input.intentCode ?? SMOKE_OPERATION_POLL_INTENT;
  const state = input.state ?? SMOKE_OPERATION_POLL_TERMINAL_STATE;

  await withServiceRoleSql(input.databaseUrl, async (sql) => {
    await sql`
      INSERT INTO operations (
        id,
        org_id,
        state,
        intent_code,
        progress
      )
      VALUES (
        ${input.operationId},
        ${input.organizationId},
        ${state},
        ${intentCode},
        ${sql.json({})}
      )
    `;
  });
}

export function assertOperationPollEnvelope(input: AssertOperationPollEnvelopeInput): void {
  const expectedIntentCode = input.expectedIntentCode ?? SMOKE_OPERATION_POLL_INTENT;
  const expectedState = input.expectedState ?? SMOKE_OPERATION_POLL_TERMINAL_STATE;

  assertEqual(input.data.operationId, input.operationId, "Operation poll operationId");
  assertEqual(input.data.organizationId, input.organizationId, "Operation poll organizationId");
  assertEqual(input.data.state, expectedState, "Operation poll state");
  assertEqual(input.data.intentCode, expectedIntentCode, "Operation poll intentCode");
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
  assertStatus(response, 403, "Cross-organization operation poll", {
    bodyText: text,
    redactor: input.redactor,
  });
  const body = await readJsonResponse(response, "Cross-organization operation poll", text);
  assertEnvelopeError(
    body,
    AUTH_ERROR_CODES.insufficientScope,
    "Cross-organization operation poll",
  );
  assertDeniedBodyFreeOfSensitiveValues(text, input.redactor, "Cross-organization operation poll");
}
