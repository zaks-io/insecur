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
  CLOUDFLARE_PROVIDER_CALL_RESULTS,
  type CloudflareProviderCallResult,
} from "../src/cloudflare-worker-provider-client.js";
import { createCloudflareWorkerSyncAdapter } from "../src/cloudflare-worker-sync-adapter.js";
import { runSecretSyncCommand } from "../src/run-secret-sync-command.js";
import type { SecretSyncWriteMaterialsResolver } from "../src/secret-sync-write-materials.js";
import {
  createFakeCloudflareWorkerClient,
  type FakeCloudflareWorkerClient,
} from "./helpers/fake-cloudflare-worker-client.js";
import {
  BINDING,
  CONN,
  ENV,
  ORG,
  PROJECT,
  SECRET,
  SYNC,
  USER,
  createActiveCloudflareSync,
  createBindingRow,
  createCloudflareConnection,
} from "./helpers/secret-sync-test-fixtures.js";

const REQUEST = requestId.brand("req_00000000000000000000000001");
const OPERATION = operationId.brand("op_00000000000000000000000001");
const BINDING_2 = secretSyncBindingId.brand("sbind_00000000000000000000000002");
const SECRET_2 = secretId.brand("sec_00000000000000000000000002");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };
const WORKER_SCRIPT_NAME = "my-api-production";
const DESTINATION_NAME = "DATABASE_URL";
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

function cloudflareAdapter(fake: FakeCloudflareWorkerClient) {
  return createCloudflareWorkerSyncAdapter({
    client: fake.client,
    destinationNameResolver: { resolveDestinationName: async () => DESTINATION_NAME },
    workerScriptNameResolver: { resolveWorkerScriptName: async () => WORKER_SCRIPT_NAME },
  });
}

const TWO_BINDINGS = [
  { bindingId: BINDING, secretId: SECRET },
  { bindingId: BINDING_2, secretId: SECRET_2 as typeof SECRET },
] as const;

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
  getSecretSyncById.mockResolvedValue(createActiveCloudflareSync());
  listBindings.mockResolvedValue(bindingRows);
  getConnectionById.mockResolvedValue(createCloudflareConnection());
  getField.mockResolvedValue({ wrapped: {} });
}

function seedOperations() {
  createOperationMock.mockResolvedValue({ operation: operationResult("pending"), created: true });
  claimSyncTargetLeaseMock.mockImplementation(async (input: { target: unknown }) => ({
    target: input.target,
    fencingToken: 7,
  }));
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

function runInput(
  fake: FakeCloudflareWorkerClient,
  overrides: Partial<Parameters<typeof runSecretSyncCommand>[0]> = {},
) {
  const adapter = cloudflareAdapter(fake);
  return {
    actor: ACTOR,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    secretSyncId: SYNC,
    lookupPorts: { "cloudflare-worker-secret": adapter.lookupPort },
    writePorts: { "cloudflare-worker-secret": adapter.writePort },
    writeMaterialsResolver: createMaterialsResolver(),
    requestId: REQUEST,
    ...overrides,
  };
}

function twoBindingRun(
  fake: FakeCloudflareWorkerClient,
  overrides: Partial<Parameters<typeof runSecretSyncCommand>[0]> = {},
) {
  seedStores([createBindingRow(), createBindingRow({ id: BINDING_2, secretId: SECRET_2 })]);
  return runInput(fake, {
    writeMaterialsResolver: createMaterialsResolver(TWO_BINDINGS),
    ...overrides,
  });
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
    leases: claimSyncTargetLeaseMock.mock.calls,
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

describe("runSecretSyncCommand with the cloudflare worker adapter", () => {
  it("stages every binding, deploys once, verifies metadata, and succeeds", async () => {
    const fake = createFakeCloudflareWorkerClient({
      lookupResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.ok,
    });
    const input = twoBindingRun(fake);

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("succeeded");
    expect(result).toMatchObject({
      totalBindings: 2,
      writtenCount: 2,
      failedCount: 0,
      verifiedCount: 2,
    });
    // ADR-0039/ADR-0057: one staged version, exactly one deploy for the run.
    expect(fake.beginCalls).toHaveLength(1);
    expect(fake.stageCalls).toHaveLength(2);
    expect(fake.deployCalls).toHaveLength(1);
    expect(transitionStates()).toEqual(["running", "succeeded"]);
    // The commit holds the fencing check too: two writes plus one commit.
    expect(assertSyncTargetLeaseMock).toHaveBeenCalledTimes(3);
    // Cloudflare serializes on the app connection id, never the script name.
    expect(claimSyncTargetLeaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          providerKind: "cloudflare-worker-secret",
          targetIdentity: CONN,
        }) as object,
      }),
    );
    // The completion audit names the production deploy impact, metadata-only.
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "sync.execution_completed",
        outcome: "success",
        details: expect.objectContaining({
          deployImpact: "cloudflare_worker_secret_deploy",
        }) as object,
      }),
    );
  });

  it("parks a staging failure incomplete and never deploys: production untouched", async () => {
    const fake = createFakeCloudflareWorkerClient({
      stageResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable,
    });
    const input = twoBindingRun(fake);

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("incomplete");
    expect(result.resultCode).toBe(PROVIDER_ERROR_CODES.unavailable);
    expect(fake.deployCalls).toHaveLength(0);
    expect(transitionOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: "incomplete",
        progress: expect.objectContaining({ cause: "retryable" }) as object,
      }),
    );
  });

  it("downgrades every binding when the single deploy fails: nothing landed", async () => {
    const fake = createFakeCloudflareWorkerClient({
      deployResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable,
    });
    const input = twoBindingRun(fake);

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("incomplete");
    expect(result.resultCode).toBe(PROVIDER_ERROR_CODES.unavailable);
    expect(result).toMatchObject({ totalBindings: 2, writtenCount: 0, failedCount: 2 });
    expect(fake.deployCalls).toHaveLength(1);
    // The denial audit reports every binding at the commit failure status.
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "sync.execution_denied",
        details: expect.objectContaining({
          writeStatus1: "provider_write.retryable_unavailable",
          writeStatus2: "provider_write.retryable_unavailable",
          deployImpact: "cloudflare_worker_secret_deploy",
        }) as object,
      }),
    );
  });

  it("parks a denied worker scope as incomplete action_required without a deploy", async () => {
    const fake = createFakeCloudflareWorkerClient({
      beginResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.permissionDenied,
    });
    const input = runInput(fake);

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("incomplete");
    expect(result.resultCode).toBe(PROVIDER_ERROR_CODES.permissionDenied);
    expect(fake.deployCalls).toHaveLength(0);
    expect(transitionOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: "incomplete",
        progress: expect.objectContaining({ cause: "action_required" }) as object,
      }),
    );
  });

  it("never deploys after the fencing token goes stale before the commit", async () => {
    const fake = createFakeCloudflareWorkerClient();
    const input = twoBindingRun(fake);
    // Two write-loop checks pass; the commit-phase check is stale.
    assertSyncTargetLeaseMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new OperationStoreError(OPERATION_ERROR_CODES.staleFencingToken, "fencing token is stale"),
      );

    const result = await runSecretSyncCommand(input);

    expect(result.resultCode).toBe(OPERATION_ERROR_CODES.staleFencingToken);
    expect(result.state).toBe("running");
    expect(fake.stageCalls).toHaveLength(2);
    expect(fake.deployCalls).toHaveLength(0);
    expect(releaseSyncTargetLeaseMock).not.toHaveBeenCalled();
  });

  it("parks a disabled connection as an auditable blocked operation with zero writes", async () => {
    getConnectionById.mockResolvedValue(createCloudflareConnection({ status: "disconnected" }));
    const fake = createFakeCloudflareWorkerClient();
    const input = runInput(fake);

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("blocked");
    expect(result.resultCode).toBe(SECRET_SYNC_ERROR_CODES.connectionNotEligible);
    expect(fake.beginCalls).toHaveLength(0);
    expect(claimSyncTargetLeaseMock).not.toHaveBeenCalled();
  });

  it("fails closed without current protected approval evidence", async () => {
    assertApprovedMock.mockRejectedValue(
      Object.assign(new Error("missing evidence"), {
        code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      }),
    );
    const fake = createFakeCloudflareWorkerClient();
    const input = runInput(fake);

    const result = await runSecretSyncCommand(input);

    expect(result.state).toBe("blocked");
    expect(result.resultCode).toBe(PROTECTED_CHANGE_ERROR_CODES.missingEvidence);
    expect(fake.beginCalls).toHaveLength(0);
    expect(fake.deployCalls).toHaveLength(0);
    expect(recordSyncAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "revalidation", outcome: "denied" }),
    );
  });

  it("keeps every operation record and audit event metadata-only", async () => {
    const okFake = createFakeCloudflareWorkerClient({
      lookupResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.ok,
    });
    await runSecretSyncCommand(runInput(okFake));

    const failingFake = createFakeCloudflareWorkerClient({
      deployResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.permissionDenied,
    });
    await runSecretSyncCommand(runInput(failingFake));

    const recorded = allRecordedMetadata();
    expect(recorded).not.toContain(SECRET_VALUE);
    expect(recorded).not.toContain(DESTINATION_NAME);
    expect(recorded).not.toContain(WORKER_SCRIPT_NAME);
  });

  it.each([
    [
      "notFound",
      CLOUDFLARE_PROVIDER_CALL_RESULTS.notFound satisfies CloudflareProviderCallResult,
      PROVIDER_ERROR_CODES.lookupNotFound,
    ],
    [
      "targetMissing",
      CLOUDFLARE_PROVIDER_CALL_RESULTS.targetMissing satisfies CloudflareProviderCallResult,
      PROVIDER_ERROR_CODES.lookupNotFound,
    ],
  ])(
    "parks a %s worker script during staging as incomplete action_required",
    async (_label, stageResult, resultCode) => {
      const fake = createFakeCloudflareWorkerClient({ stageResult });
      const input = runInput(fake);

      const result = await runSecretSyncCommand(input);

      expect(result.state).toBe("incomplete");
      expect(result.resultCode).toBe(resultCode);
      expect(fake.deployCalls).toHaveLength(0);
    },
  );
});
