import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import type { OperationPollResult } from "@insecur/operations";
import { cancelOperationInTenantScope, OperationStoreError } from "@insecur/operations";
import {
  OPERATION_ERROR_CODES,
  operationId,
  organizationId,
  requestId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordOperationCancelDenied, recordOperationCanceledInTenantScope } from "@insecur/audit";
import { withTenantScope } from "@insecur/tenant-store";

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
    recordOperationCanceledInTenantScope: vi.fn(),
    recordOperationCancelDenied: vi.fn(),
  };
});

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    cancelOperationInTenantScope: vi.fn(),
    OperationStoreError: actual.OperationStoreError,
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return { ...actual, withTenantScope: vi.fn() };
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
const scopedSql = {} as never;

describe("cancelOperationOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(cancelOperationInTenantScope).mockReset();
    vi.mocked(recordOperationCanceledInTenantScope).mockReset();
    vi.mocked(recordOperationCancelDenied).mockReset();
    vi.mocked(withTenantScope).mockReset();
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) =>
      run({ sql: scopedSql } as never),
    );
    vi.mocked(cancelOperationInTenantScope).mockResolvedValue({
      operation: { ...runningOperation, state: "canceled" },
      created: false,
    });
    vi.mocked(recordOperationCanceledInTenantScope).mockResolvedValue({
      auditEventId: "aud_00000000000000000000000001",
    });
  });

  it("authorizes operation-cancel access, cancels, and records success audit", async () => {
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
      requiredScope: AUTHORIZATION_SCOPES.operationCancel,
      requestId: request,
    });
    expect(cancelOperationInTenantScope).toHaveBeenCalledWith(scopedSql, {
      organizationId: organization,
      operationId: operation,
    });
    expect(recordOperationCanceledInTenantScope).toHaveBeenCalledWith(scopedSql, {
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

  it("does not cancel when mutation authorization is denied", async () => {
    vi.mocked(authorizeScopeOrThrow).mockRejectedValue(
      Object.assign(new Error("Missing required permission."), {
        code: "auth.insufficient_scope",
      }),
    );

    await expect(
      cancelOperationOperation({
        input: {
          organizationId: organization,
          operationId: operation,
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor: actor,
        accessActor,
      }),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });

    expect(authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ requiredScope: AUTHORIZATION_SCOPES.operationCancel }),
    );
    expect(cancelOperationInTenantScope).not.toHaveBeenCalled();
    expect(recordOperationCanceledInTenantScope).not.toHaveBeenCalled();
  });

  it("records denied audit and rethrows when cancel is not allowed", async () => {
    vi.mocked(cancelOperationInTenantScope).mockRejectedValue(
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
    expect(recordOperationCanceledInTenantScope).not.toHaveBeenCalled();
    expect(recordOperationCancelDenied).toHaveBeenCalledWith({
      actor: actor,
      organizationId: organization,
      operationId: operation,
      request: { requestId: request },
      reasonCode: OPERATION_ERROR_CODES.notCancelable,
    });
  });

  it("rolls back cancellation when the success audit insert fails", async () => {
    let committedState: OperationPollResult["state"] = "running";
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) => {
      let stagedState = committedState;
      const transactionSql = {
        setState(state: OperationPollResult["state"]) {
          stagedState = state;
        },
      };
      const result = await run({ sql: transactionSql } as never);
      committedState = stagedState;
      return result;
    });
    vi.mocked(cancelOperationInTenantScope).mockImplementation(async (sql) => {
      (sql as unknown as { setState(state: OperationPollResult["state"]): void }).setState(
        "canceled",
      );
      return {
        operation: { ...runningOperation, state: "canceled" },
        created: false,
      };
    });
    vi.mocked(recordOperationCanceledInTenantScope).mockRejectedValue(
      new Error("audit insert failed"),
    );

    await expect(
      cancelOperationOperation({
        input: {
          organizationId: organization,
          operationId: operation,
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor: actor,
        accessActor,
      }),
    ).rejects.toThrow("audit insert failed");

    expect(committedState).toBe("running");
    expect(recordOperationCancelDenied).not.toHaveBeenCalled();
  });
});
