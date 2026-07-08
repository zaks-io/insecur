import { bytesToBase64Url, environmentId, organizationId, projectId } from "@insecur/domain";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import app from "../../src/index.js";
import { captureHttpResponse, type EgressHttpResponse } from "./egress-sweep.js";

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);
const SECRETS_PREFIX = `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}`;

export function uniqueVariableKey(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

interface CanaryRequestInput {
  label: string;
  method: "GET" | "POST";
  path: string;
  headers: Record<string, string>;
  workerEnv: Record<string, unknown>;
  body?: unknown;
}

/** Issue one canary route request and capture its serialized egress, hard-failing off the 200 path. */
async function canaryRequest(input: CanaryRequestInput): Promise<EgressHttpResponse> {
  const response = await app.request(
    input.path,
    {
      method: input.method,
      headers: input.headers,
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    },
    input.workerEnv,
  );
  const bodyText = await response.text();
  if (response.status !== 200) {
    throw new Error(`canary ${input.label} failed with status ${response.status}`);
  }
  return captureHttpResponse(input.label, response, bodyText);
}

export function writeSecretByVariableKey(
  headers: Record<string, string>,
  variableKey: string,
  sentinelValue: string,
  workerEnv: Record<string, unknown>,
): Promise<EgressHttpResponse> {
  return canaryRequest({
    label: "write",
    method: "POST",
    path: `${SECRETS_PREFIX}/secrets/by-variable-key`,
    headers,
    workerEnv,
    body: { organizationId: ORG_A, variableKey, value: sentinelValue },
  });
}

export async function issueRuntimeInjectionGrant(
  headers: Record<string, string>,
  variableKey: string,
  workerEnv: Record<string, unknown>,
): Promise<{ grantId: string; response: EgressHttpResponse }> {
  const response = await canaryRequest({
    label: "issue",
    method: "POST",
    path: `/v1/orgs/${ORG_A}/runtime-injection/grants`,
    headers,
    workerEnv,
    body: { organizationId: ORG_A, projectId: PROJECT_A, environmentId: ENV_A, variableKey },
  });
  const grantId = (JSON.parse(response.bodyText) as { data: { grantId: string } }).data.grantId;
  return { grantId, response };
}

export function listEnvironmentSecrets(
  headers: Record<string, string>,
  workerEnv: Record<string, unknown>,
): Promise<EgressHttpResponse> {
  return canaryRequest({
    label: "list-secrets",
    method: "GET",
    path: `${SECRETS_PREFIX}/secrets`,
    headers,
    workerEnv,
  });
}

export function listSecretVersions(
  headers: Record<string, string>,
  secretId: string,
  workerEnv: Record<string, unknown>,
): Promise<EgressHttpResponse> {
  return canaryRequest({
    label: "list-versions",
    method: "GET",
    path: `${SECRETS_PREFIX}/secrets/${secretId}/versions`,
    headers,
    workerEnv,
  });
}

export async function checkSecretPossession(input: {
  headers: Record<string, string>;
  variableKey: string;
  sentinelValue: string;
  workerEnv: Record<string, unknown>;
}): Promise<EgressHttpResponse> {
  // Submit the sentinel itself as the candidate: this yields a `match` verdict and, crucially,
  // routes the sentinel through the possession-check request body and RPC seam. The canary sweep
  // then proves the candidate never surfaces in HTTP egress, console output, or Postgres.
  const response = await canaryRequest({
    label: "possession-check",
    method: "POST",
    path: `${SECRETS_PREFIX}/secrets/possession-check`,
    headers: input.headers,
    workerEnv: input.workerEnv,
    body: { variableKey: input.variableKey, value: input.sentinelValue },
  });
  const verdict = (JSON.parse(response.bodyText) as { data: { verdict: string } }).data.verdict;
  if (verdict !== "match") {
    throw new Error(`canary possession check returned unexpected verdict ${verdict}`);
  }
  return response;
}

export async function consumeRuntimeInjectionGrant(input: {
  headers: Record<string, string>;
  grantId: string;
  variableKey: string;
  sentinelValue: string;
  workerEnv: Record<string, unknown>;
}): Promise<EgressHttpResponse> {
  const response = await canaryRequest({
    label: "consume",
    method: "POST",
    path: `/v1/orgs/${ORG_A}/runtime-injection/grants/${input.grantId}/consume`,
    headers: input.headers,
    workerEnv: input.workerEnv,
    body: { organizationId: ORG_A, variableKey: input.variableKey },
  });

  const consumeBody = JSON.parse(response.bodyText) as { delivery: { encodedValueUtf8: string } };
  const expected = bytesToBase64Url(new TextEncoder().encode(input.sentinelValue));
  if (consumeBody.delivery.encodedValueUtf8 !== expected) {
    throw new Error("canary grant consume returned unexpected encoded value");
  }
  return response;
}
