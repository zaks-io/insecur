import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import type { OperationPollResult } from "@insecur/operations";
import { cancelOperation, OperationStoreError } from "@insecur/operations";
import {
  OPERATION_ERROR_CODES,
  operationId,
  organizationId,
  requestId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordOperationCancelDenied, recordOperationCanceled } from "@insecur/audit";

import {
  cancelOperationOperation,
  type CancelOperationOperationInput,
} from "./cancel-operation-operation.js";
import type { GetOperationOperationInput } from "./get-operation-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordOperationCanceled: vi.fn(),
    recordOperationCancelDenied: vi.fn(),
  };
});

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    cancelOperation: vi.fn(),
    OperationStoreError: actual.OperationStoreError,
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

const runningOperation: OperationPollResult = {
  operationId: operation,
  organizationId: organization,
  state: "running",
  intentCode: "sync.run",
  progress: {},
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("cancelOperationOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(cancelOperation).mockReset();
    vi.mocked(recordOperationCanceled).mockReset();
    vi.mocked(recordOperationCancelDenied).mockReset();
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    vi.mocked(cancelOperation).mockResolvedValue({
      operation: { ...runningOperation, state: "canceled" },
      created: false,
    });
    vi.mocked(recordOperationCanceled).mockResolvedValue({
      auditEventId: "aud_00000000000000000000000001",
    });
  });

  it("authorizes org-read access, cancels, and records success audit", async () => {
    const input: CancelOperationOperationInput["input"] = {
      organizationId: organization,
      operationId: operation,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    const result = await cancelOperationOperation({ input, auditActor: actor, accessActor });

    expect(authorizeScopeOrThrow).toHaveBeenCalledWith({
      actor: accessActor,
      auditActor: actor,
      coordinate: { organizationId: organization },
      requiredScope: AUTHORIZATION_SCOPES.organizationRead,
      requestId: request,
    });
    expect(cancelOperation).toHaveBeenCalledWith({
      organizationId: organization,
      operationId: operation,
    });
    expect(recordOperationCanceled).toHaveBeenCalledWith({
      actor: actor,
      organizationId: organization,
      operationId: operation,
      request: { requestId: request },
    });
    expect(recordOperationCancelDenied).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      operationId: operation,
      organizationId: organization,
      state: "canceled",
      auditEventId: "aud_00000000000000000000000001",
    });
  });

  it("records denied audit and rethrows when cancel is not allowed", async () => {
    vi.mocked(cancelOperation).mockRejectedValue(
      new OperationStoreError(OPERATION_ERROR_CODES.notCancelable, "not cancelable"),
    );
    vi.mocked(recordOperationCancelDenied).mockResolvedValue({
      auditEventId: "aud_00000000000000000000000002",
    });

    const input: CancelOperationOperationInput["input"] = {
      organizationId: organization,
      operationId: operation,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      cancelOperationOperation({ input, auditActor: actor, accessActor }),
    ).rejects.toBeInstanceOf(OperationStoreError);
    expect(recordOperationCanceled).not.toHaveBeenCalled();
    expect(recordOperationCancelDenied).toHaveBeenCalledWith({
      actor: actor,
      organizationId: organization,
      operationId: operation,
      request: { requestId: request },
      reasonCode: OPERATION_ERROR_CODES.notCancelable,
    });
  });
});
