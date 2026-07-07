import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  bytesToBase64Url,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import type { RuntimeRpc } from "@insecur/worker-kit";
import {
  TEST_ENV_A_ID,
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../../packages/tenant-store/test/rls/test-root-key.js";
import app from "../../src/index.js";
import {
  captureHttpResponse,
  type EgressCapture,
  type EgressHttpResponse,
} from "./egress-sweep.js";
import {
  createFakeRuntimeBinding,
  wrapRuntimeRpcBinding,
  type FakeRuntimeEnv,
} from "../support/fake-runtime-binding.js";

const ADMITTED_USER_ID = TEST_USER_ID;
const WORKOS_USER_ID = TEST_WORKOS_USER_ID;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);

const RUNTIME_TOKEN_SIGNING_SECRET = "canary-runtime-hop-secret-0000000000000000000000000";

const runtimeEnv: FakeRuntimeEnv = {
  INSTANCE_ROOT_KEY_V1: {
    get: (): Promise<string> => Promise.resolve(RLS_TEST_ROOT_KEY_HEX),
  },
  RUNTIME_TOKEN_SIGNING_SECRET,
};

function createCapturingRuntimeBinding(
  env: FakeRuntimeEnv,
  onConsumeGrant: (payloadJson: string) => void,
): RuntimeRpc {
  const binding = createFakeRuntimeBinding(env);
  return wrapRuntimeRpcBinding(binding, {
    consumeGrant: async (input) => {
      const result = await binding.consumeGrant(input);
      onConsumeGrant(JSON.stringify(result));
      return result;
    },
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(ADMITTED_USER_ID),
      workosUserId: WORKOS_USER_ID,
      sessionId: "session_canary",
    },
    signingSecret: testSessionSigningSecret(),
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

function uniqueVariableKey(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

async function writeSecretByVariableKey(
  headers: Record<string, string>,
  variableKey: string,
  sentinelValue: string,
  workerEnv: Record<string, unknown>,
): Promise<EgressHttpResponse> {
  const writeResponse = await app.request(
    `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ organizationId: ORG_A, variableKey, value: sentinelValue }),
    },
    workerEnv,
  );
  const bodyText = await writeResponse.text();
  if (writeResponse.status !== 200) {
    throw new Error(`canary write failed with status ${writeResponse.status}`);
  }
  return captureHttpResponse("write", writeResponse, bodyText);
}

async function issueRuntimeInjectionGrant(
  headers: Record<string, string>,
  variableKey: string,
  workerEnv: Record<string, unknown>,
): Promise<{ grantId: string; response: EgressHttpResponse }> {
  const issueResponse = await app.request(
    `/v1/orgs/${ORG_A}/runtime-injection/grants`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        variableKey,
      }),
    },
    workerEnv,
  );
  const bodyText = await issueResponse.text();
  if (issueResponse.status !== 200) {
    throw new Error(`canary grant issue failed with status ${issueResponse.status}`);
  }
  const grantId = (JSON.parse(bodyText) as { data: { grantId: string } }).data.grantId;
  return {
    grantId,
    response: captureHttpResponse("issue", issueResponse, bodyText),
  };
}

async function listEnvironmentSecrets(
  headers: Record<string, string>,
  workerEnv: Record<string, unknown>,
): Promise<EgressHttpResponse> {
  const response = await app.request(
    `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets`,
    { method: "GET", headers },
    workerEnv,
  );
  const bodyText = await response.text();
  if (response.status !== 200) {
    throw new Error(`canary secrets list failed with status ${response.status}`);
  }
  return captureHttpResponse("list-secrets", response, bodyText);
}

async function listSecretVersions(
  headers: Record<string, string>,
  secretId: string,
  workerEnv: Record<string, unknown>,
): Promise<EgressHttpResponse> {
  const response = await app.request(
    `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets/${secretId}/versions`,
    { method: "GET", headers },
    workerEnv,
  );
  const bodyText = await response.text();
  if (response.status !== 200) {
    throw new Error(`canary secret versions list failed with status ${response.status}`);
  }
  return captureHttpResponse("list-versions", response, bodyText);
}

async function consumeRuntimeInjectionGrant(input: {
  headers: Record<string, string>;
  grantId: string;
  variableKey: string;
  sentinelValue: string;
  workerEnv: Record<string, unknown>;
}): Promise<EgressHttpResponse> {
  const consumeResponse = await app.request(
    `/v1/orgs/${ORG_A}/runtime-injection/grants/${input.grantId}/consume`,
    {
      method: "POST",
      headers: input.headers,
      body: JSON.stringify({ organizationId: ORG_A, variableKey: input.variableKey }),
    },
    input.workerEnv,
  );
  const bodyText = await consumeResponse.text();
  if (consumeResponse.status !== 200) {
    throw new Error(`canary grant consume failed with status ${consumeResponse.status}`);
  }

  const consumeBody = JSON.parse(bodyText) as {
    delivery: { encodedValueUtf8: string };
  };
  const expected = bytesToBase64Url(new TextEncoder().encode(input.sentinelValue));
  if (consumeBody.delivery.encodedValueUtf8 !== expected) {
    throw new Error("canary grant consume returned unexpected encoded value");
  }

  return captureHttpResponse("consume", consumeResponse, bodyText);
}

function createCanaryWorkerEnv(): {
  workerEnv: Record<string, unknown>;
  getRpcDeliveryPayloadJson: () => string;
} {
  let rpcDeliveryPayloadJson = "";
  return {
    workerEnv: {
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
      SESSION_SIGNING_SECRET: testSessionSigningSecret(),
      INSTANCE_ID: TEST_INSTANCE_ID,
      RUNTIME_TOKEN_SIGNING_SECRET,
      RUNTIME: createCapturingRuntimeBinding(runtimeEnv, (payloadJson) => {
        rpcDeliveryPayloadJson = payloadJson;
      }),
    },
    getRpcDeliveryPayloadJson: () => rpcDeliveryPayloadJson,
  };
}

/**
 * Drive Blind Secret Write → grant issue → grant consume with a canary sentinel
 * through the real Worker route stack, capturing serialized HTTP and RPC egress.
 */
export async function driveFirstValueWithSentinel(sentinelValue: string): Promise<EgressCapture> {
  const { workerEnv, getRpcDeliveryPayloadJson } = createCanaryWorkerEnv();

  const headers = await authHeaders();
  const variableKey = uniqueVariableKey("CANARY");
  const writeResponse = await writeSecretByVariableKey(
    headers,
    variableKey,
    sentinelValue,
    workerEnv,
  );
  const secretIdValue = (JSON.parse(writeResponse.bodyText) as { data: { secretId: string } }).data
    .secretId;

  const listSecretsResponse = await listEnvironmentSecrets(headers, workerEnv);
  const listVersionsResponse = await listSecretVersions(headers, secretIdValue, workerEnv);

  const { grantId, response: issueResponse } = await issueRuntimeInjectionGrant(
    headers,
    variableKey,
    workerEnv,
  );
  const consumeResponse = await consumeRuntimeInjectionGrant({
    headers,
    grantId,
    variableKey,
    sentinelValue,
    workerEnv,
  });

  const rpcDeliveryPayloadJson = getRpcDeliveryPayloadJson();
  if (!rpcDeliveryPayloadJson) {
    throw new Error("canary did not capture Runtime consumeGrant RPC delivery payload");
  }

  return {
    httpResponses: [
      writeResponse,
      listSecretsResponse,
      listVersionsResponse,
      issueResponse,
      consumeResponse,
    ],
    rpcDeliveryPayloadJson,
  };
}
