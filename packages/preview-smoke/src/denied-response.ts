import { AUTH_ERROR_CODES } from "@insecur/domain";

import { authHeaders } from "./auth.js";
import { assertEnvelopeError, assertStatus, readJsonResponse, type JsonRecord } from "./http.js";

export interface AssertDeniedInsufficientScopeInput {
  bearer: string;
  expectedStatus?: number;
  label: string;
  redactor: (value: unknown) => string;
  url: string;
}

/** Asserts a stable insufficient_scope denial envelope without leaking sensitive values. */
export async function assertGetDeniedInsufficientScope(
  input: AssertDeniedInsufficientScopeInput,
): Promise<JsonRecord> {
  const response = await fetch(input.url, {
    headers: authHeaders(input.bearer),
    method: "GET",
  });
  const text = await response.text();
  assertStatus(response, input.expectedStatus ?? 403, input.label, {
    bodyText: text,
    redactor: input.redactor,
  });
  const body = await readJsonResponse(response, input.label, text);
  assertEnvelopeError(body, AUTH_ERROR_CODES.insufficientScope, input.label);
  assertDeniedBodyFreeOfSensitiveValues(text, input.redactor, input.label);
  return body;
}

export async function assertPostDeniedInsufficientScope(
  input: AssertDeniedInsufficientScopeInput & { body: JsonRecord },
): Promise<JsonRecord> {
  const response = await fetch(input.url, {
    body: JSON.stringify(input.body),
    headers: { ...authHeaders(input.bearer), "Content-Type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  assertStatus(response, input.expectedStatus ?? 403, input.label, {
    bodyText: text,
    redactor: input.redactor,
  });
  const json = await readJsonResponse(response, input.label, text);
  assertEnvelopeError(json, AUTH_ERROR_CODES.insufficientScope, input.label);
  assertDeniedBodyFreeOfSensitiveValues(text, input.redactor, input.label);
  return json;
}

export function assertDeniedBodyFreeOfSensitiveValues(
  bodyText: string,
  redactor: (value: unknown) => string,
  label: string,
): void {
  const redacted = redactor(bodyText);
  if (redacted.includes("[redacted]")) {
    throw new Error(`${label} response body leaked a sensitive value after redaction.`);
  }
}
