import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import type { OperationPollResult } from "@insecur/operations";
import { getOperation } from "@insecur/operations";
import type { GetOperationRpcInput } from "@insecur/worker-kit";
import { operationId, organizationId, requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getOperationOperation,
  type GetOperationOperationInput,
} from "./get-operation-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    getOperation: vi.fn(),
  };
});

const organization = organizationId.generate();
const operation = operationId.brand("op_00000000000000000000000001");
const request = requestId.generate();
const actor: GetOperationOperationInput["auditActor"] = {
  type: "user",
  userId: userId.generate(),
};
const accessActor: GetOperationOperationInput["accessActor"] = {
  type: "user",
  userId: actor.userId,
};

describe("getOperationOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(getOperation).mockReset();
  });

  it("authorizes org-read access before reading operation state", async () => {
    const events: string[] = [];
    const result: OperationPollResult = {
      operationId: operation,
      organizationId: organization,
      state: "running",
      intentCode: "test.intent",
      progress: {},
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async () => {
      events.push("authorize");
    });
    vi.mocked(getOperation).mockImplementation(async () => {
      events.push("get");
      return result;
    });

    const input: GetOperationRpcInput = {
      organizationId: organization,
      operationId: operation,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(getOperationOperation({ input, auditActor: actor, accessActor })).resolves.toBe(
      result,
    );

    expect(events).toEqual(["authorize", "get"]);
    expect(authorizeScopeOrThrow).toHaveBeenCalledWith({
      actor: accessActor,
      auditActor: actor,
      coordinate: { organizationId: organization },
      requiredScope: AUTHORIZATION_SCOPES.organizationRead,
      requestId: request,
    });
    expect(getOperation).toHaveBeenCalledWith({
      organizationId: organization,
      operationId: operation,
    });
  });
});
