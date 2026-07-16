import * as audit from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  OPERATION_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  SECRET_SYNC_ERROR_CODES,
  operationId,
  requestId,
  secretSyncId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/assert-secret-sync-access.js", () => ({
  resolveSecretSyncRunAccess: vi.fn(async () => undefined),
}));

vi.mock("../src/assert-secret-sync-delivery-approval.js", () => ({
  assertProtectedSecretSyncActionApproved: vi.fn(async () => undefined),
}));

vi.mock("../src/assert-secret-sync-bindings.js", () => ({
  assertSecretSyncBindings: vi.fn(async () => undefined),
}));

const getSecretSyncById = vi.fn();
const listBindings = vi.fn();
const getConnectionById = vi.fn();
const getField = vi.fn();

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, run: (ctx: { db: never }) => unknown) =>
      run({ db: {} as never }),
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

import { resolveSecretSyncRunAccess } from "../src/assert-secret-sync-access.js";
import { assertSecretSyncBindings } from "../src/assert-secret-sync-bindings.js";
import { assertProtectedSecretSyncActionApproved } from "../src/assert-secret-sync-delivery-approval.js";
import {
  PROVIDER_LOOKUP_STATUSES,
  type ProviderLookupStatus,
} from "../src/provider-lookup-port.js";
import { revalidateSecretSyncPlanBeforeProviderWrites } from "../src/revalidate-secret-sync-plan.js";
import { computeSecretSyncPlan, type SecretSyncPlan } from "../src/secret-sync-plan.js";
import { SecretSyncError } from "../src/secret-sync-error.js";
import { createFakeProviderLookupPort } from "./helpers/fake-provider-lookup.js";
import {
  BINDING,
  ENV,
  ORG,
  PROJECT,
  SYNC,
  USER,
  createActiveGitHubSync,
  createBindingRow,
  createGitHubConnection,
} from "./helpers/secret-sync-test-fixtures.js";

const REQUEST = requestId.brand("req_00000000000000000000000001");
const OPERATION = operationId.brand("op_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };
const LEASE = { operationId: OPERATION, fencingToken: 3 };

function seedStores() {
  getSecretSyncById.mockResolvedValue(createActiveGitHubSync());
  listBindings.mockResolvedValue([createBindingRow()]);
  getConnectionById.mockResolvedValue(createGitHubConnection());
  getField.mockResolvedValue({ wrapped: {} });
}

async function planWith(status: ProviderLookupStatus): Promise<SecretSyncPlan> {
  return computeSecretSyncPlan({
    db: {} as never,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    secretSyncId: SYNC,
    lookupPorts: { "github-actions": createFakeProviderLookupPort({ [BINDING]: status }).port },
  });
}

function revalidate(
  plan: SecretSyncPlan,
  status: ProviderLookupStatus,
  overrides: { lease?: typeof LEASE; secretSyncId?: typeof SYNC } = {},
) {
  return revalidateSecretSyncPlanBeforeProviderWrites({
    actor: ACTOR,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    secretSyncId: overrides.secretSyncId ?? SYNC,
    plan,
    lookupPorts: { "github-actions": createFakeProviderLookupPort({ [BINDING]: status }).port },
    lease: overrides.lease ?? LEASE,
    requestId: REQUEST,
  });
}

function spyRecordSyncAudit() {
  return vi.spyOn(audit, "recordSyncAudit").mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  seedStores();
});

describe("revalidateSecretSyncPlanBeforeProviderWrites", () => {
  it("returns a fresh plan and writes no audit event when nothing changed", async () => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.found);

    const fresh = await revalidate(plan, PROVIDER_LOOKUP_STATUSES.found);

    expect(fresh.fingerprint).toBe(plan.fingerprint);
    expect(fresh.bindings[0]?.overwriteWarning).toBe(true);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("requires an acquired sync target lease before revalidating", async () => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);

    await expect(
      revalidate(plan, PROVIDER_LOOKUP_STATUSES.notFound, {
        lease: { operationId: OPERATION, fencingToken: 0 },
      }),
    ).rejects.toMatchObject({ code: OPERATION_ERROR_CODES.leaseRequired });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "revalidation",
        outcome: "denied",
        operationId: OPERATION,
        reasonCode: OPERATION_ERROR_CODES.leaseRequired,
      }),
    );
  });

  it("fails closed as stale when the plan belongs to a different secret sync", async () => {
    spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);

    await expect(
      revalidate(
        { ...plan, secretSyncId: secretSyncId.brand("sync_00000000000000000000000002") },
        PROVIDER_LOOKUP_STATUSES.notFound,
      ),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.stalePlan });
  });

  it("fails closed and audits when sync configuration changed after planning", async () => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);
    getSecretSyncById.mockResolvedValue(
      createActiveGitHubSync({ updatedAt: new Date("2026-03-01T00:00:00.000Z") }),
    );

    await expect(revalidate(plan, PROVIDER_LOOKUP_STATUSES.notFound)).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.stalePlan,
    });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "revalidation",
        outcome: "denied",
        operationId: OPERATION,
        reasonCode: SECRET_SYNC_ERROR_CODES.stalePlan,
      }),
    );
  });

  it("fails closed as stale when overwrite status drifted since planning", async () => {
    spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);

    await expect(revalidate(plan, PROVIDER_LOOKUP_STATUSES.found)).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.stalePlan,
    });
  });

  it.each([
    [PROVIDER_LOOKUP_STATUSES.targetMissing, PROVIDER_ERROR_CODES.lookupNotFound],
    [PROVIDER_LOOKUP_STATUSES.permissionDenied, PROVIDER_ERROR_CODES.permissionDenied],
    [PROVIDER_LOOKUP_STATUSES.boundaryMismatch, PROVIDER_ERROR_CODES.boundaryMismatch],
    [PROVIDER_LOOKUP_STATUSES.unavailable, PROVIDER_ERROR_CODES.unavailable],
  ])("fails closed before provider writes when fresh lookup is %s", async (status, reason) => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);

    await expect(revalidate(plan, status)).rejects.toMatchObject({ code: reason });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "denied", reasonCode: reason }),
    );
  });

  it("fails closed and audits when the connection was disabled after planning", async () => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);
    getConnectionById.mockResolvedValue(createGitHubConnection({ status: "disconnected" }));

    await expect(revalidate(plan, PROVIDER_LOOKUP_STATUSES.notFound)).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.connectionNotEligible,
    });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      }),
    );
  });

  it("fails closed and audits when the sync was disabled after planning", async () => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);
    getSecretSyncById.mockResolvedValue(
      createActiveGitHubSync({ status: "disabled", disabledAt: new Date() }),
    );

    await expect(revalidate(plan, PROVIDER_LOOKUP_STATUSES.notFound)).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.disabled,
    });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: SECRET_SYNC_ERROR_CODES.disabled }),
    );
  });

  it("fails closed when the actor lost sync run scope after planning", async () => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);
    vi.mocked(resolveSecretSyncRunAccess).mockRejectedValueOnce(
      new SecretSyncError(AUTH_ERROR_CODES.insufficientScope, "secret sync run scope required"),
    );

    await expect(revalidate(plan, PROVIDER_LOOKUP_STATUSES.notFound)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: AUTH_ERROR_CODES.insufficientScope }),
    );
  });

  it("gates a run through the protected delivery approval seam before provider writes", async () => {
    spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.found);

    await revalidate(plan, PROVIDER_LOOKUP_STATUSES.found);

    expect(assertProtectedSecretSyncActionApproved).toHaveBeenCalledWith(
      "secret_sync_run",
      expect.objectContaining({ organizationId: ORG, environmentId: ENV, secretSyncId: SYNC }),
      SYNC,
    );
  });

  it("fails closed and audits when protected run approval evidence is missing", async () => {
    const auditSpy = spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.found);
    vi.mocked(assertProtectedSecretSyncActionApproved).mockRejectedValueOnce(
      Object.assign(new Error("missing approval evidence"), {
        code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      }),
    );

    await expect(revalidate(plan, PROVIDER_LOOKUP_STATUSES.found)).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "revalidation",
        outcome: "denied",
        reasonCode: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      }),
    );
  });

  it("fails closed when a bound source secret disappeared after planning", async () => {
    spyRecordSyncAudit();
    const plan = await planWith(PROVIDER_LOOKUP_STATUSES.notFound);
    vi.mocked(assertSecretSyncBindings).mockRejectedValueOnce(
      new SecretSyncError(
        SECRET_SYNC_ERROR_CODES.secretBindingNotFound,
        "secret sync binding secret not found in source environment",
      ),
    );

    await expect(revalidate(plan, PROVIDER_LOOKUP_STATUSES.notFound)).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.secretBindingNotFound,
    });
  });
});
