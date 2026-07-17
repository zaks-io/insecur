import { PlaintextHandle } from "@insecur/crypto";
import {
  OPERATION_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  SECRET_SYNC_ERROR_CODES,
  operationId,
  requestId,
  secretId,
  secretSyncBindingId,
  secretVersionId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertApprovedMock,
  getSecretSyncById,
  listBindings,
  getConnectionById,
  getField,
  createOperationMock,
  claimSyncTargetLeaseMock,
  transitionOperationMock,
  recordOperationProgressMock,
  releaseSyncTargetLeaseMock,
  assertSyncTargetLeaseMock,
  writeAuditEventMock,
  recordSyncAuditMock,
} = vi.hoisted(() => ({
  assertApprovedMock: vi.fn(),
  getSecretSyncById: vi.fn(),
  listBindings: vi.fn(),
  getConnectionById: vi.fn(),
  getField: vi.fn(),
  createOperationMock: vi.fn(),
  claimSyncTargetLeaseMock: vi.fn(),
  transitionOperationMock: vi.fn(),
  recordOperationProgressMock: vi.fn(),
  releaseSyncTargetLeaseMock: vi.fn(),
  assertSyncTargetLeaseMock: vi.fn(),
  writeAuditEventMock: vi.fn(),
  recordSyncAuditMock: vi.fn(),
}));

vi.mock("../src/assert-secret-sync-access.js", () => ({
  resolveSecretSyncRunAccess: vi.fn(async () => undefined),
}));

vi.mock("../src/assert-secret-sync-delivery-approval.js", () => ({
  assertProtectedSecretSyncActionApproved: assertApprovedMock,
}));

vi.mock("../src/assert-secret-sync-bindings.js", () => ({
  assertSecretSyncBindings: vi.fn(async () => undefined),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, run: (ctx: { db: never; sql: never }) => unknown) =>
      run({ db: {} as never, sql: {} as never }),
    ),
    TenantSecretSyncStore: class {
      getSecretSyncById = getSecretSyncById;
      listBindings = listBindings;
    },
    TenantAppConnectionStore: class {
      getConnectionById = getConnectionById;
    },
    TenantSensitiveMetadataStore: class {
      getField = getField;
    },
  };
});

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    createOperation: createOperationMock,
    claimSyncTargetLease: claimSyncTargetLeaseMock,
    transitionOperation: transitionOperationMock,
    recordOperationProgress: recordOperationProgressMock,
    releaseSyncTargetLease: releaseSyncTargetLeaseMock,
    assertSyncTargetLease: assertSyncTargetLeaseMock,
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return { ...actual, writeAuditEvent: writeAuditEventMock, recordSyncAudit: recordSyncAuditMock };
});

import { OperationStoreError } from "@insecur/operations";
import {
  PROVIDER_LOOKUP_STATUSES,
  type ProviderDestinationLookupRequest,
  type SecretSyncProviderLookupPort,
} from "../src/provider-lookup-port.js";
import {
  PROVIDER_WRITE_STATUSES,
  type ProviderSecretWriteRequest,
  type ProviderWriteStatus,
  type SecretSyncProviderWritePort,
} from "../src/provider-sync-write-port.js";
import { runSecretSyncCommand } from "../src/run-secret-sync-command.js";
import type { SecretSyncWriteMaterialsResolver } from "../src/secret-sync-write-materials.js";
import {
  BINDING,
  ENV,
  ORG,
  PROJECT,
  SECRET,
  SYNC,
  USER,
  createActiveGitHubSync,
  createBindingRow,
  createGitHubConnection,
} from "./helpers/secret-sync-test-fixtures.js";

const REQUEST = requestId.brand("req_00000000000000000000000001");
const OPERATION = operationId.brand("op_00000000000000000000000001");
const BINDING_2 = secretSyncBindingId.brand("sbind_00000000000000000000000002");
const SECRET_2 = secretId.brand("sec_00000000000000000000000002");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };
const DESTINATION_NAME = "DEPLOY_TOKEN";
const SECRET_VALUE = "top-secret-provider-value";

function operationResult(state: string, progress: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION,
    organizationId: ORG,
    state,
    intentCode: "sync.run",
    progress,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

interface FakeWritePort {
  readonly port: SecretSyncProviderWritePort;
  readonly writes: ProviderSecretWriteRequest[];
}

function createFakeWritePort(
  statusByBindingId: Readonly<Record<string, ProviderWriteStatus>> = {},
  defaultStatus: ProviderWriteStatus = PROVIDER_WRITE_STATUSES.written,
): FakeWritePort {
  const writes: ProviderSecretWriteRequest[] = [];
  return {
    writes,
    port: {
      assertWritableDestination: () => undefined,
      writeExactDestination: async (request) => {
        writes.push(request);
        return { status: statusByBindingId[request.bindingId] ?? defaultStatus };
      },
    },
  };
}

/** Lookup fake that reports not_found until a write lands, then found. */
function createWriteAwareLookupPort(writes: ProviderSecretWriteRequest[]): {
  port: SecretSyncProviderLookupPort;
  requests: ProviderDestinationLookupRequest[];
} {
  const requests: ProviderDestinationLookupRequest[] = [];
  return {
    requests,
    port: {
      lookupExactDestination: async (request) => {
        requests.push(request);
        const written = writes.some((write) => write.bindingId === request.bindingId);
        return {
          status: written ? PROVIDER_LOOKUP_STATUSES.found : PROVIDER_LOOKUP_STATUSES.notFound,
        };
      },
    },
  };
}

function createMaterialsResolver(
  bindings: readonly { bindingId: typeof BINDING; secretId: typeof SECRET }[] = [
    { bindingId: BINDING, secretId: SECRET },
  ],
): SecretSyncWriteMaterialsResolver {
  return {
    resolveWriteMaterials: async () =>
      bindings.map((binding) => ({
        bindingId: binding.bindingId,
        secretId: binding.secretId,
        secretVersionId: VERSION,
        destinationName: DESTINATION_NAME,
        value: new PlaintextHandle(new TextEncoder().encode(SECRET_VALUE)),
      })),
  };
}

function seedStores(bindingRows = [createBindingRow()]) {
  getSecretSyncById.mockResolvedValue(createActiveGitHubSync());
  listBindings.mockResolvedValue(bindingRows);
  getConnectionById.mockResolvedValue(createGitHubConnection());
  getField.mockResolvedValue({ wrapped: {} });
}

function seedOperations() {
  createOperationMock.mockResolvedValue({ operation: operationResult("pending"), created: true });
  claimSyncTargetLeaseMock.mockResolvedValue({
    target: {
      organizationId: ORG,
      projectId: PROJECT,
      providerKind: "github-actions",
      targetIdentity: "repo_00000000000000000000000001",
    },
    fencingToken: 7,
  });
  transitionOperationMock.mockImplementation(async (input: { nextState: string }) => ({
    operation: operationResult(input.nextState),
    created: false,
  }));
  recordOperationProgressMock.mockResolvedValue({
    operation: operationResult("running"),
    created: false,
  });
  releaseSyncTargetLeaseMock.mockResolvedValue(undefined);
  assertSyncTargetLeaseMock.mockResolvedValue(undefined);
}

function runInput(overrides: Partial<Parameters<typeof runSecretSyncCommand>[0]> = {}) {
  const writePort = createFakeWritePort();
  const lookup = createWriteAwareLookupPort(writePort.writes);
  return {
    input: {
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretSyncId: SYNC,
      lookupPorts: { "github-actions": lookup.port },
      writePorts: { "github-actions": writePort.port },
      writeMaterialsResolver: createMaterialsResolver(),
      requestId: REQUEST,
      ...overrides,
    },
    writePort,
    lookup,
  };
}

function transitionStates(): string[] {
  return transitionOperationMock.mock.calls.map(
    (call) => (call[0] as { nextState: string }).nextState,
  );
}

function allRecordedMetadata(): string {
  return JSON.stringify({
    audits: writeAuditEventMock.mock.calls,
    syncAudits: recordSyncAuditMock.mock.calls,
    transitions: transitionOperationMock.mock.calls,
    progress: recordOperationProgressMock.mock.calls,
    creates: createOperationMock.mock.calls,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  assertApprovedMock.mockResolvedValue(undefined);
  writeAuditEventMock.mockResolvedValue({ auditEventId: "aud_00000000000000000000000001" });
  recordSyncAuditMock.mockResolvedValue({ auditEventId: "aud_00000000000000000000000002" });
  seedStores();
  seedOperations();
});

describe("runSecretSyncCommand", () => {
  it("writes every exact bound destination, verifies metadata, and succeeds", async () => {
    seedStores([createBindingRow(), createBindingRow({ id: BINDING_2, secretId: SECRET_2 })]);
    const { input, writePort } = runInput({
      writeMaterialsResolver: createMaterialsResolver([
        { bindingId: BINDING, secretId: SECRET },
        { bindingId: BINDING_2, secretId: SECRET_2 as typeof SECRET },
      ]),
    });

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("succeeded");
    expect(result.startedExecution).toBe(true);
    expect(result).toMatchObject({
      totalBindings: 2,
      writtenCount: 2,
      failedCount: 0,
      verifiedCount: 2,
    });
    expect(writePort.writes.map((write) => write.bindingId)).toEqual([BINDING, BINDING_2]);
    expect(transitionStates()).toEqual(["running", "succeeded"]);
    expect(assertSyncTargetLeaseMock).toHaveBeenCalledTimes(2);
    expect(releaseSyncTargetLeaseMock).toHaveBeenCalledTimes(1);
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "sync.execution_completed", outcome: "success" }),
    );
  });

  it("parks a denied repository scope as incomplete action_required", async () => {
    const writePort = createFakeWritePort({}, PROVIDER_WRITE_STATUSES.permissionDenied);
    const lookup = createWriteAwareLookupPort([]);
    const { input } = runInput({
      writePorts: { "github-actions": writePort.port },
      lookupPorts: { "github-actions": lookup.port },
    });

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("incomplete");
    expect(result.resultCode).toBe(PROVIDER_ERROR_CODES.permissionDenied);
    expect(transitionStates()).toEqual(["running", "incomplete"]);
    expect(transitionOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: "incomplete",
        progress: expect.objectContaining({ cause: "action_required" }) as object,
      }),
    );
    expect(releaseSyncTargetLeaseMock).toHaveBeenCalledTimes(1);
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "sync.execution_denied", outcome: "denied" }),
    );
  });

  it("parks a transient provider failure as incomplete retryable", async () => {
    const writePort = createFakeWritePort({}, PROVIDER_WRITE_STATUSES.retryableUnavailable);
    const { input } = runInput({ writePorts: { "github-actions": writePort.port } });

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("incomplete");
    expect(result.resultCode).toBe(PROVIDER_ERROR_CODES.unavailable);
    expect(transitionOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: "incomplete",
        progress: expect.objectContaining({ cause: "retryable" }) as object,
      }),
    );
  });

  it("stops writing immediately when the fencing token goes stale", async () => {
    seedStores([createBindingRow(), createBindingRow({ id: BINDING_2, secretId: SECRET_2 })]);
    assertSyncTargetLeaseMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new OperationStoreError(OPERATION_ERROR_CODES.staleFencingToken, "fencing token is stale"),
      );
    const { input, writePort } = runInput({
      writeMaterialsResolver: createMaterialsResolver([
        { bindingId: BINDING, secretId: SECRET },
        { bindingId: BINDING_2, secretId: SECRET_2 as typeof SECRET },
      ]),
    });

    const result = await runSecretSyncCommand(input);

    // Exactly one write happened; the stale holder never wrote binding two.
    expect(writePort.writes).toHaveLength(1);
    expect(result.resultCode).toBe(OPERATION_ERROR_CODES.staleFencingToken);
    expect(result.state).toBe("running");
    expect(result.writtenCount).toBe(1);
    // No terminal transition and no lease release from the stale holder.
    expect(transitionStates()).toEqual(["running"]);
    expect(releaseSyncTargetLeaseMock).not.toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "sync.execution_denied", outcome: "denied" }),
    );
  });

  it("parks a disabled connection as an auditable blocked operation with zero writes", async () => {
    getConnectionById.mockResolvedValue(createGitHubConnection({ status: "disconnected" }));
    const { input, writePort } = runInput();

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("blocked");
    expect(result.resultCode).toBe(SECRET_SYNC_ERROR_CODES.connectionNotEligible);
    expect(writePort.writes).toHaveLength(0);
    expect(claimSyncTargetLeaseMock).not.toHaveBeenCalled();
    expect(transitionStates()).toEqual(["blocked"]);
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "sync.execution_denied", outcome: "denied" }),
    );
  });

  it("fails closed without current protected approval evidence", async () => {
    assertApprovedMock.mockRejectedValue(
      Object.assign(new Error("missing evidence"), {
        code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      }),
    );
    const { input, writePort } = runInput();

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("blocked");
    expect(result.resultCode).toBe(PROTECTED_CHANGE_ERROR_CODES.missingEvidence);
    expect(writePort.writes).toHaveLength(0);
    expect(transitionStates()).toEqual(["running", "blocked"]);
    expect(releaseSyncTargetLeaseMock).toHaveBeenCalledTimes(1);
    // Revalidation denial and execution denial are both auditable.
    expect(recordSyncAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "revalidation", outcome: "denied" }),
    );
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "sync.execution_denied" }),
    );
  });

  it("returns the existing operation without live effects on an idempotent retry", async () => {
    createOperationMock.mockResolvedValue({
      operation: operationResult("incomplete", { resultCode: PROVIDER_ERROR_CODES.unavailable }),
      created: false,
    });
    const { input, writePort } = runInput({ idempotencyKey: "retry-key-1" });

    const result = await runSecretSyncCommand(input);

    expect(result.startedExecution).toBe(false);
    expect(result.state).toBe("incomplete");
    expect(result.resultCode).toBe(PROVIDER_ERROR_CODES.unavailable);
    expect(writePort.writes).toHaveLength(0);
    expect(claimSyncTargetLeaseMock).not.toHaveBeenCalled();
    expect(transitionOperationMock).not.toHaveBeenCalled();
  });

  it("closes out with zero writes when the operation is canceled before start", async () => {
    transitionOperationMock.mockRejectedValueOnce(
      new OperationStoreError(OPERATION_ERROR_CODES.terminalState, "operation is canceled"),
    );
    const { input, writePort } = runInput();

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("canceled");
    expect(writePort.writes).toHaveLength(0);
    expect(releaseSyncTargetLeaseMock).toHaveBeenCalledTimes(1);
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "sync.execution_denied", outcome: "denied" }),
    );
  });

  it("blocks a stale caller plan fingerprint before claiming the lease", async () => {
    const { input, writePort } = runInput({ expectedPlanFingerprint: "stale-fingerprint" });

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("blocked");
    expect(result.resultCode).toBe(SECRET_SYNC_ERROR_CODES.stalePlan);
    expect(claimSyncTargetLeaseMock).not.toHaveBeenCalled();
    expect(writePort.writes).toHaveLength(0);
  });

  it("blocks the whole run pre-write when a destination fails the write gate", async () => {
    const writePort = createFakeWritePort();
    writePort.port.assertWritableDestination = () => {
      throw Object.assign(new Error("too large"), {
        code: SECRET_SYNC_ERROR_CODES.providerValueTooLarge,
      });
    };
    const { input } = runInput({ writePorts: { "github-actions": writePort.port } });

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("blocked");
    expect(result.resultCode).toBe(SECRET_SYNC_ERROR_CODES.providerValueTooLarge);
    expect(writePort.writes).toHaveLength(0);
    expect(releaseSyncTargetLeaseMock).toHaveBeenCalledTimes(1);
  });

  it("blocks with source_value_missing when materials resolution fails", async () => {
    const { input, writePort } = runInput({
      writeMaterialsResolver: {
        resolveWriteMaterials: async () => {
          throw Object.assign(new Error("no current version"), {
            code: SECRET_SYNC_ERROR_CODES.sourceValueMissing,
          });
        },
      },
    });

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("blocked");
    expect(result.resultCode).toBe(SECRET_SYNC_ERROR_CODES.sourceValueMissing);
    expect(writePort.writes).toHaveLength(0);
  });

  it("keeps every operation record and audit event metadata-only", async () => {
    const { input } = runInput();
    await runSecretSyncCommand(input);

    const failed = createFakeWritePort({}, PROVIDER_WRITE_STATUSES.permissionDenied);
    const { input: deniedInput } = runInput({
      writePorts: { "github-actions": failed.port },
    });
    await runSecretSyncCommand(deniedInput);

    const recorded = allRecordedMetadata();
    expect(recorded).not.toContain(SECRET_VALUE);
    expect(recorded).not.toContain(DESTINATION_NAME);
  });
});
