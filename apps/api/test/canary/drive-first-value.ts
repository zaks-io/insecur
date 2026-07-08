import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { userId } from "@insecur/domain";
import type { RuntimeRpc } from "@insecur/worker-kit";
import {
  TEST_INSTANCE_ID,
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../../packages/tenant-store/test/rls/test-root-key.js";
import type { EgressCapture } from "./egress-sweep.js";
import {
  checkSecretPossession,
  consumeRuntimeInjectionGrant,
  issueRuntimeInjectionGrant,
  listEnvironmentSecrets,
  listSecretVersions,
  uniqueVariableKey,
  writeSecretByVariableKey,
} from "./drive-first-value-requests.js";
import { createFakeRuntimeBinding, type FakeRuntimeEnv } from "../support/fake-runtime-binding.js";

const ADMITTED_USER_ID = TEST_USER_ID;
const WORKOS_USER_ID = TEST_WORKOS_USER_ID;

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
  return new Proxy(binding, {
    get(target, property, receiver) {
      if (property === "consumeGrant") {
        return async (input: Parameters<RuntimeRpc["consumeGrant"]>[0]) => {
          const result = await target.consumeGrant(input);
          onConsumeGrant(JSON.stringify(result));
          return result;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as RuntimeRpc;
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
  const possessionResponse = await checkSecretPossession({
    headers,
    variableKey,
    sentinelValue,
    workerEnv,
  });

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
      possessionResponse,
      issueResponse,
      consumeResponse,
    ],
    rpcDeliveryPayloadJson,
  };
}
