import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import type { Keyring } from "@insecur/crypto";
import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  requestId,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { assertSecretWriteCoordinate, writeNonProtectedSecret } from "@insecur/secret-store";
import type { WriteSecretRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import { generateSecretValueUtf8 } from "../secret-generation.js";
import { writeSecretOperation, type WriteSecretOperationInput } from "./write-secret-operation.js";

vi.mock("@insecur/secret-store", () => ({
  assertSecretWriteCoordinate: vi.fn(),
  writeNonProtectedSecret: vi.fn(),
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

vi.mock("../secret-generation.js", () => ({
  generateSecretValueUtf8: vi.fn(),
}));

const env = {
  RUNTIME_TOKEN_SIGNING_SECRET: "runtime-operation-secret",
} as RuntimeEnv;
const keyring = { kind: "test-keyring" } as unknown as Keyring;
const organization = organizationId.generate();
const project = projectId.generate();
const environment = environmentId.generate();
const secret = secretId.generate();
const version = secretVersionId.generate();
const request = requestId.generate();
const actor: WriteSecretOperationInput["auditActor"] = { type: "user", userId: userId.generate() };
const accessActor: WriteSecretOperationInput["accessActor"] = {
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

const testDescriptiveVerdicts = {
  valueByteLength: 11,
  encodingClass: "utf-8" as const,
  isEmpty: false,
  hasLeadingOrTrailingWhitespace: false,
  looksLikePlaceholder: false,
  secretShapeMatchVerdict: "no_shape_rule" as const,
};

describe("writeSecretOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(assertSecretWriteCoordinate).mockReset();
    vi.mocked(writeNonProtectedSecret).mockReset();
    vi.mocked(createKeyringFromRuntimeEnv).mockReset();
    vi.mocked(generateSecretValueUtf8).mockReset();
  });

  it("authorizes before coordinate validation, then writes through the Runtime keyring", async () => {
    const events: string[] = [];
    const valueUtf8 = new Uint8Array([4, 5, 6]);
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async () => {
      events.push("authorize");
    });
    vi.mocked(assertSecretWriteCoordinate).mockImplementation(async () => {
      events.push("coordinate");
      return { isProtected: false };
    });
    vi.mocked(createKeyringFromRuntimeEnv).mockImplementation(() => {
      events.push("keyring");
      return keyring;
    });
    vi.mocked(writeNonProtectedSecret).mockImplementation(async () => {
      events.push("write");
      return {
        secretId: secret,
        secretVersionId: version,
        variableKey,
        createdSecretShape: true,
        descriptiveVerdicts: testDescriptiveVerdicts,
        auditEventId: "aud_write",
      };
    });

    const input: WriteSecretRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      variableKey,
      valueUtf8,
      allowEmpty: true,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    const payload = await writeSecretOperation({ env, input, auditActor: actor, accessActor });

    expect(events).toEqual(["authorize", "coordinate", "keyring", "write"]);
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
    expect(assertSecretWriteCoordinate).toHaveBeenCalledWith({
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      actor,
      request: { requestId: request },
    });
    expect(writeNonProtectedSecret).toHaveBeenCalledWith({
      keyring,
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      variableKey,
      actor,
      valueUtf8,
      allowEmpty: true,
      request: { requestId: request },
    });
    expect(payload).toEqual({
      secretId: secret,
      secretVersionId: version,
      variableKey,
      createdSecretShape: true,
      descriptiveVerdicts: testDescriptiveVerdicts,
      auditEventId: "aud_write",
    });
  });

  it("generates Runtime-local secret bytes for generated writes", async () => {
    const generatedValue = new Uint8Array([7, 8, 9]);
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    vi.mocked(assertSecretWriteCoordinate).mockResolvedValue({ isProtected: false });
    vi.mocked(createKeyringFromRuntimeEnv).mockReturnValue(keyring);
    vi.mocked(generateSecretValueUtf8).mockReturnValue(generatedValue);
    vi.mocked(writeNonProtectedSecret).mockResolvedValue({
      secretId: secret,
      secretVersionId: version,
      variableKey,
      createdSecretShape: false,
      descriptiveVerdicts: testDescriptiveVerdicts,
    });

    const input: WriteSecretRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      variableKey,
      secretId: secret,
      generate: { mode: "random", lengthBytes: 32 },
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await writeSecretOperation({ env, input, auditActor: actor, accessActor });

    expect(generateSecretValueUtf8).toHaveBeenCalledWith({ mode: "random", lengthBytes: 32 });
    expect(writeNonProtectedSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        secretId: secret,
        valueUtf8: generatedValue,
      }),
    );
  });
});
