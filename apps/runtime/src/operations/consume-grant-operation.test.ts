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
import { consumeInjectionGrant } from "@insecur/runtime-injection";
import type { ConsumeGrantRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import { consumeGrantOperation } from "./consume-grant-operation.js";

vi.mock("@insecur/runtime-injection", () => ({
  consumeInjectionGrant: vi.fn(),
}));

vi.mock("../crypto/keyring-context.js", () => ({
  createKeyringFromRuntimeEnv: vi.fn(),
}));

const env = {
  RUNTIME_TOKEN_SIGNING_SECRET: "runtime-operation-secret",
} as RuntimeEnv;
const keyring = { kind: "test-keyring" } as unknown as Keyring;
const organization = organizationId.generate();
const grant = injectionGrantId.generate();
const secret = secretId.generate();
const version = secretVersionId.generate();
const request = requestId.generate();
const actor = { type: "user" as const, userId: userId.generate() };
const variableKey = (() => {
  const parsed = parseVariableKey("API_KEY");
  if (!parsed.ok) {
    throw new Error("test variable key must parse");
  }
  return parsed.value;
})();

describe("consumeGrantOperation", () => {
  beforeEach(() => {
    vi.mocked(createKeyringFromRuntimeEnv).mockReset();
    vi.mocked(consumeInjectionGrant).mockReset();
    vi.mocked(createKeyringFromRuntimeEnv).mockReturnValue(keyring);
  });

  it("constructs the Runtime keyring, consumes the grant, and returns the RPC delivery envelope", async () => {
    const plaintextBytes = new Uint8Array([1, 2, 3]);
    vi.mocked(consumeInjectionGrant).mockResolvedValue({
      secretId: secret,
      secretVersionId: version,
      variableKey,
      valueUtf8: new PlaintextHandle(plaintextBytes),
      auditEventId: "aud_consume",
    });

    const input: ConsumeGrantRpcInput = {
      organizationId: organization,
      grantId: grant,
      variableKey,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    const envelope = await consumeGrantOperation({ env, input, auditActor: actor });

    expect(createKeyringFromRuntimeEnv).toHaveBeenCalledWith(env);
    expect(consumeInjectionGrant).toHaveBeenCalledWith({
      keyring,
      organizationId: organization,
      grantId: grant,
      variableKey,
      actor,
      request: { requestId: request },
    });
    expect(envelope).toEqual({
      ok: true,
      delivery: {
        grantId: grant,
        secretId: secret,
        secretVersionId: version,
        variableKey,
        encodedValueUtf8: bytesToBase64Url(plaintextBytes),
        auditEventId: "aud_consume",
      },
      meta: { requestId: request },
    });
  });
});
