import { PlaintextHandle, type Keyring } from "@insecur/crypto";
import {
  bytesToBase64Url,
  injectionGrantId,
  organizationId,
  parseVariableKey,
  requestId,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { consumeInjectionGrantAll } from "@insecur/runtime-injection";
import type { ConsumeGrantAllRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import { consumeGrantAllOperation } from "./consume-grant-all-operation.js";

vi.mock("@insecur/runtime-injection", () => ({
  consumeInjectionGrantAll: vi.fn(),
}));

vi.mock("../crypto/keyring-context.js", () => ({
  createKeyringFromRuntimeEnv: vi.fn(),
}));

const env: RuntimeEnv = {
  RUNTIME_TOKEN_SIGNING_SECRET: "runtime-operation-secret",
};
const keyring = { kind: "test-keyring" } as unknown as Keyring;
const organization = organizationId.generate();
const grant = injectionGrantId.generate();
const secretA = secretId.generate();
const secretB = secretId.generate();
const versionA = secretVersionId.generate();
const versionB = secretVersionId.generate();
const request = requestId.generate();
const actor = { type: "user" as const, userId: userId.generate() };
const variableKeyA = (() => {
  const parsed = parseVariableKey("API_KEY");
  if (!parsed.ok) {
    throw new Error("test variable key must parse");
  }
  return parsed.value;
})();
const variableKeyB = (() => {
  const parsed = parseVariableKey("DATABASE_URL");
  if (!parsed.ok) {
    throw new Error("test variable key must parse");
  }
  return parsed.value;
})();

describe("consumeGrantAllOperation", () => {
  beforeEach(() => {
    vi.mocked(createKeyringFromRuntimeEnv).mockReset();
    vi.mocked(consumeInjectionGrantAll).mockReset();
    vi.mocked(createKeyringFromRuntimeEnv).mockReturnValue(keyring);
  });

  it("constructs the Runtime keyring, consumes all bindings, and returns the RPC delivery envelope", async () => {
    const plaintextBytesA = new Uint8Array([1, 2, 3]);
    const plaintextBytesB = new Uint8Array([4, 5, 6]);
    vi.mocked(consumeInjectionGrantAll).mockResolvedValue({
      entries: [
        {
          secretId: secretA,
          secretVersionId: versionA,
          variableKey: variableKeyA,
          valueUtf8: new PlaintextHandle(plaintextBytesA),
        },
        {
          secretId: secretB,
          secretVersionId: versionB,
          variableKey: variableKeyB,
          valueUtf8: new PlaintextHandle(plaintextBytesB),
        },
      ],
      auditEventId: "aud_consume_all",
    });

    const input: ConsumeGrantAllRpcInput = {
      organizationId: organization,
      grantId: grant,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    const envelope = await consumeGrantAllOperation({ env, input, auditActor: actor });

    expect(createKeyringFromRuntimeEnv).toHaveBeenCalledWith(env);
    expect(consumeInjectionGrantAll).toHaveBeenCalledWith({
      keyring,
      organizationId: organization,
      grantId: grant,
      actor,
      request: { requestId: request },
    });
    expect(envelope).toEqual({
      ok: true,
      delivery: {
        grantId: grant,
        entries: [
          {
            secretId: secretA,
            secretVersionId: versionA,
            variableKey: variableKeyA,
            encodedValueUtf8: bytesToBase64Url(plaintextBytesA),
          },
          {
            secretId: secretB,
            secretVersionId: versionB,
            variableKey: variableKeyB,
            encodedValueUtf8: bytesToBase64Url(plaintextBytesB),
          },
        ],
        auditEventId: "aud_consume_all",
      },
      meta: { requestId: request },
    });
  });

  it("omits auditEventId when consume-all returns no audit id", async () => {
    vi.mocked(consumeInjectionGrantAll).mockResolvedValue({
      entries: [
        {
          secretId: secretA,
          secretVersionId: versionA,
          variableKey: variableKeyA,
          valueUtf8: new PlaintextHandle(new Uint8Array([1])),
        },
      ],
    });

    const envelope = await consumeGrantAllOperation({
      env,
      input: {
        organizationId: organization,
        grantId: grant,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
      },
      auditActor: actor,
    });

    expect(envelope.delivery.auditEventId).toBeUndefined();
  });
});
