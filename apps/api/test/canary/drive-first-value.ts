import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import {
  bytesToBase64Url,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../../packages/tenant-store/test/rls/test-root-key.js";
import app from "../../src/index.js";
import { createFakeRuntimeBinding } from "../support/fake-runtime-binding.js";

const ADMITTED_USER_ID = TEST_USER_ID;
const WORKOS_USER_ID = "user_01workos_canary";

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);

const RUNTIME_TOKEN_SIGNING_SECRET = "canary-runtime-hop-secret-0000000000000000000000000";

const runtimeEnv = {
  INSTANCE_ROOT_KEY_V1: {
    get: (): Promise<string> => Promise.resolve(RLS_TEST_ROOT_KEY_HEX),
  },
  RUNTIME_TOKEN_SIGNING_SECRET,
};

const workerEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  INSTANCE_ID: "inst_LOCAL_DEV",
  ADMITTED_USER_MAP_JSON: JSON.stringify({ [WORKOS_USER_ID]: ADMITTED_USER_ID }),
  RUNTIME_TOKEN_SIGNING_SECRET,
  RUNTIME: createFakeRuntimeBinding(runtimeEnv),
};

async function authHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(ADMITTED_USER_ID),
      workosUserId: WORKOS_USER_ID,
      sessionId: "session_canary",
    },
    signingSecret: workerEnv.SESSION_SIGNING_SECRET,
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
): Promise<void> {
  const writeResponse = await app.request(
    `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ organizationId: ORG_A, variableKey, value: sentinelValue }),
    },
    workerEnv,
  );
  if (writeResponse.status !== 200) {
    throw new Error(`canary write failed with status ${writeResponse.status}`);
  }
}

async function issueRuntimeInjectionGrant(
  headers: Record<string, string>,
  variableKey: string,
): Promise<string> {
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
  if (issueResponse.status !== 200) {
    throw new Error(`canary grant issue failed with status ${issueResponse.status}`);
  }
  return ((await issueResponse.json()) as { data: { grantId: string } }).data.grantId;
}

async function consumeRuntimeInjectionGrant(
  headers: Record<string, string>,
  grantId: string,
  variableKey: string,
  sentinelValue: string,
): Promise<void> {
  const consumeResponse = await app.request(
    `/v1/orgs/${ORG_A}/runtime-injection/grants/${grantId}/consume`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ organizationId: ORG_A, variableKey }),
    },
    workerEnv,
  );
  if (consumeResponse.status !== 200) {
    throw new Error(`canary grant consume failed with status ${consumeResponse.status}`);
  }

  const consumeBody = (await consumeResponse.json()) as {
    delivery: { encodedValueUtf8: string };
  };
  const expected = bytesToBase64Url(new TextEncoder().encode(sentinelValue));
  if (consumeBody.delivery.encodedValueUtf8 !== expected) {
    throw new Error("canary grant consume returned unexpected encoded value");
  }
}

/**
 * Drive Blind Secret Write → grant issue → grant consume with a canary sentinel
 * through the real Worker route stack.
 */
export async function driveFirstValueWithSentinel(sentinelValue: string): Promise<void> {
  const headers = await authHeaders();
  const variableKey = uniqueVariableKey("CANARY");
  await writeSecretByVariableKey(headers, variableKey, sentinelValue);
  const grantId = await issueRuntimeInjectionGrant(headers, variableKey);
  await consumeRuntimeInjectionGrant(headers, grantId, variableKey, sentinelValue);
}
