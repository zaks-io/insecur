import type { Response as PageResponse } from "@playwright/test";

import { authHeaders } from "./auth";
import { redactValue } from "./redaction";

export type JsonRecord = Record<string, unknown>;

export interface PostJsonInput {
  bearer: string;
  body: JsonRecord;
  label: string;
  redactor?: (value: unknown) => string;
  url: string;
}

interface AssertStatusOptions {
  bodyText?: string;
  redactor?: (value: unknown) => string;
}

export async function getJson(
  url: string,
  label: string,
  options: RequestInit = {},
  redactor: (value: unknown) => string = redactValue,
): Promise<JsonRecord> {
  return requestJson(url, label, options, redactor);
}

export async function postJson(input: PostJsonInput): Promise<JsonRecord> {
  return requestJson(
    input.url,
    input.label,
    {
      body: JSON.stringify(input.body),
      headers: { ...authHeaders(input.bearer), "Content-Type": "application/json" },
      method: "POST",
    },
    input.redactor,
  );
}

async function requestJson(
  url: string,
  label: string,
  options: RequestInit = {},
  redactor: (value: unknown) => string = redactValue,
): Promise<JsonRecord> {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...headersToRecord(options.headers) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed with ${String(response.status)}: ${redactor(text)}`);
  }
  return parseJson(text, label);
}

export async function readJsonResponse(
  response: Response,
  label: string,
  bodyText?: string,
): Promise<JsonRecord> {
  return parseJson(bodyText ?? (await response.text()), label);
}

export function assertIdentity(body: JsonRecord, service: string, expectedSha: string): void {
  assertEqual(body.ok, true, `${service} health ok`);
  assertEqual(body.service, service, `${service} health service`);
  assertEqual(body.deploySha, expectedSha, `${service} health deploySha`);
  requireString(body.runId, `${service} health runId`);
  requireString(body.deployedAt, `${service} health deployedAt`);
}

export function assertEnvelopeData(body: JsonRecord, label: string): JsonRecord {
  assertEqual(body.ok, true, `${label} ok`);
  return asRecord(body.data, `${label} data`);
}

export function assertEnvelopeError(body: JsonRecord, code: string, label: string): void {
  assertEqual(body.ok, false, `${label} ok`);
  assertEqual(asRecord(body.error, `${label} error`).code, code, `${label} error code`);
}

export function assertStatus(
  response: PageResponse | Response | null,
  expected: number,
  label: string,
  options: AssertStatusOptions = {},
): void {
  const status = responseStatus(response);
  if (status !== expected) {
    const redactor = options.redactor ?? redactValue;
    throw new Error(`${label} returned ${String(status)}: ${redactor(options.bodyText)}`);
  }
}

export function requireResponse<T extends PageResponse | Response>(
  response: T | null,
  label: string,
): T {
  if (response === null) {
    throw new Error(`${label} did not return an HTTP response`);
  }
  return response;
}

export function assertHeaderEquals(
  response: PageResponse | Response,
  name: string,
  expected: string,
  label: string,
): void {
  const value = headerValue(response, name);
  if (value !== expected) {
    throw new Error(`${label} expected ${name}: ${expected}, got ${String(value)}`);
  }
}

export function assertHeaderContains(
  response: PageResponse | Response,
  name: string,
  expected: string,
  label: string,
): void {
  const value = headerValue(response, name) ?? "";
  if (!value.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`${label} expected ${name} to include ${expected}`);
  }
}

export function assertTextIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label} did not include expected text: ${expected}`);
  }
}

export function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

export function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

export function collectOperationId(body: JsonRecord): string | undefined {
  const data = typeof body.data === "object" && body.data !== null ? (body.data as JsonRecord) : {};
  const meta = typeof body.meta === "object" && body.meta !== null ? (body.meta as JsonRecord) : {};
  const operationId = meta.operationId ?? data.operationId ?? body.operationId;
  return typeof operationId === "string" ? operationId : undefined;
}

function parseJson(text: string, label: string): JsonRecord {
  try {
    return asRecord(JSON.parse(text), label);
  } catch {
    throw new Error(`${label} returned non-JSON body`);
  }
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function responseStatus(response: PageResponse | Response | null): number | undefined {
  if (response === null) {
    return undefined;
  }
  return typeof response.status === "number" ? response.status : response.status();
}

function headerValue(response: PageResponse | Response, name: string): string | null {
  return response.headers instanceof Headers
    ? response.headers.get(name)
    : (response.headers()[name.toLowerCase()] ?? null);
}
