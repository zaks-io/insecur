import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import type { Keyring } from "@insecur/crypto";
import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  requestId,
  secretId,
  userId,
} from "@insecur/domain";
import { assertSecretPossessionCoordinate, checkSecretPossession } from "@insecur/secret-store";
import type { CheckSecretPossessionRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import {
  checkSecretPossessionOperation,
  type CheckSecretPossessionOperationInput,
} from "./check-secret-possession-operation.js";

vi.mock("@insecur/secret-store", () => ({
  assertSecretPossessionCoordinate: vi.fn(),
  checkSecretPossession: vi.fn(),
}));

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("../crypto/keyring-context.js", () => ({
  createKeyringFromRuntimeEnv: vi.fn(),
}));

const env = {
  RUNTIME_TOKEN_SIGNING_SECRET: "runtime-operation-secret",
} as RuntimeEnv;
const keyring = { kind: "test-keyring" } as unknown as Keyring;
const organization = organizationId.generate();
const project = projectId.generate();
const environment = environmentId.generate();
const secret = secretId.generate();
const request = requestId.generate();
const actor: CheckSecretPossessionOperationInput["auditActor"] = {
  type: "user",
  userId: userId.generate(),
};
const accessActor: CheckSecretPossessionOperationInput["accessActor"] = {
  type: "user",
  userId: actor.userId,
};
const variableKey = (() => {
  const parsed = parseVariableKey("API_KEY");
  if (!parsed.ok) {
    throw new Error("test variable key must parse");
  }
  return parsed.value;
})();

describe("checkSecretPossessionOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(assertSecretPossessionCoordinate).mockReset();
    vi.mocked(checkSecretPossession).mockReset();
    vi.mocked(createKeyringFromRuntimeEnv).mockReset();
  });

  it("authorizes before the possession-specific coordinate guard, then compares in the Runtime keyring", async () => {
    const events: string[] = [];
    const candidateUtf8 = new Uint8Array([4, 5, 6]);
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async () => {
      events.push("authorize");
    });
    vi.mocked(assertSecretPossessionCoordinate).mockImplementation(async () => {
      events.push("coordinate");
      return { isProtected: false };
    });
    vi.mocked(createKeyringFromRuntimeEnv).mockImplementation(() => {
      events.push("keyring");
      return keyring;
    });
    vi.mocked(checkSecretPossession).mockImplementation(async () => {
      events.push("check");
      return {
        secretId: secret,
        variableKey,
        verdict: "match",
        auditEventId: "aud_check",
      };
    });

    const input: CheckSecretPossessionRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      variableKey,
      secretId: secret,
      candidateUtf8,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    const payload = await checkSecretPossessionOperation({
      env,
      input,
      auditActor: actor,
      accessActor,
    });

    expect(events).toEqual(["authorize", "coordinate", "keyring", "check"]);
    expect(authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: accessActor,
        auditActor: actor,
        coordinate: {
          organizationId: organization,
          projectId: project,
          environmentId: environment,
        },
        requiredScope: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
        requestId: request,
      }),
    );
    expect(assertSecretPossessionCoordinate).toHaveBeenCalledWith({
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      secretId: secret,
      actor,
      request: { requestId: request },
    });
    expect(checkSecretPossession).toHaveBeenCalledWith({
      keyring,
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      variableKey,
      secretId: secret,
      candidateUtf8,
      actor,
      request: { requestId: request },
    });
    expect(payload).toEqual({
      secretId: secret,
      variableKey,
      verdict: "match",
      auditEventId: "aud_check",
    });
  });

  it("omits secretId from the coordinate guard when the caller targets by variable key only", async () => {
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    vi.mocked(assertSecretPossessionCoordinate).mockResolvedValue({ isProtected: false });
    vi.mocked(createKeyringFromRuntimeEnv).mockReturnValue(keyring);
    vi.mocked(checkSecretPossession).mockResolvedValue({
      secretId: secret,
      variableKey,
      verdict: "mismatch",
      auditEventId: "aud_check",
    });

    const input: CheckSecretPossessionRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      variableKey,
      candidateUtf8: new Uint8Array([1, 2, 3]),
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await checkSecretPossessionOperation({ env, input, auditActor: actor, accessActor });

    expect(assertSecretPossessionCoordinate).toHaveBeenCalledWith({
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      actor,
      request: { requestId: request },
    });
  });

  it("does not run the possession check when the coordinate guard rejects", async () => {
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    const coordinateError = new Error("coordinate invalid");
    vi.mocked(assertSecretPossessionCoordinate).mockRejectedValue(coordinateError);

    const input: CheckSecretPossessionRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      variableKey,
      candidateUtf8: new Uint8Array([1, 2, 3]),
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      checkSecretPossessionOperation({ env, input, auditActor: actor, accessActor }),
    ).rejects.toBe(coordinateError);
    expect(checkSecretPossession).not.toHaveBeenCalled();
  });
});
