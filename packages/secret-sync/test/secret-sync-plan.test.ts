import * as audit from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  SECRET_SYNC_ERROR_CODES,
  assertMetadataSafeDetailMap,
  projectId,
  requestId,
  secretSyncBindingId,
  secretId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/assert-secret-sync-access.js", () => ({
  resolveSecretSyncRunAccess: vi.fn(async () => undefined),
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
import { planSecretSyncCommand } from "../src/plan-secret-sync-command.js";
import { PROVIDER_LOOKUP_STATUSES } from "../src/provider-lookup-port.js";
import { toPlanBindingAuditDetails } from "../src/record-secret-sync-plan-audit.js";
import { computeSecretSyncPlan } from "../src/secret-sync-plan.js";
import { SecretSyncError } from "../src/secret-sync-error.js";
import { createFakeProviderLookupPort } from "./helpers/fake-provider-lookup.js";
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

const BINDING_B = secretSyncBindingId.brand("sbind_00000000000000000000000002");
const SECRET_B = secretId.brand("sec_00000000000000000000000002");
const REQUEST = requestId.brand("req_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };

function computePlan(port: ReturnType<typeof createFakeProviderLookupPort>["port"]) {
  return computeSecretSyncPlan({
    db: {} as never,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    secretSyncId: SYNC,
    lookupPorts: { "github-actions": port },
  });
}

function spyWriteAuditEventWithRealValidation() {
  return vi.spyOn(audit, "writeAuditEvent").mockImplementation(async (event) => {
    audit.validateAuditEventInput(event);
    return { auditEventId: audit.generateAuditEventId() };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSecretSyncById.mockResolvedValue(createActiveGitHubSync());
  listBindings.mockResolvedValue([
    createBindingRow(),
    createBindingRow({ id: BINDING_B, secretId: SECRET_B }),
  ]);
  getConnectionById.mockResolvedValue(createGitHubConnection());
  getField.mockResolvedValue({ wrapped: {} });
});

describe("computeSecretSyncPlan", () => {
  it("produces metadata-only plan rows with existence, permission, and overwrite warnings", async () => {
    const fake = createFakeProviderLookupPort({
      [BINDING]: PROVIDER_LOOKUP_STATUSES.found,
      [BINDING_B]: PROVIDER_LOOKUP_STATUSES.notFound,
    });

    const plan = await computePlan(fake.port);

    expect(plan.secretSyncId).toBe(SYNC);
    expect(plan.connectionStatus).toBe("active");
    expect(plan.overwriteWarningCount).toBe(1);
    expect(plan.warningCodes).toEqual([]);
    expect(plan.bindings).toEqual([
      {
        bindingId: BINDING,
        secretId: SECRET,
        lookupStatus: "provider_lookup.found",
        targetExistence: "provider_target.exists",
        permissionStatus: "provider_permission.granted",
        overwriteWarning: true,
      },
      {
        bindingId: BINDING_B,
        secretId: SECRET_B,
        lookupStatus: "provider_lookup.not_found",
        targetExistence: "provider_target.missing",
        permissionStatus: "provider_permission.granted",
        overwriteWarning: false,
      },
    ]);
  });

  it("looks up only the exact configured binding destinations", async () => {
    const fake = createFakeProviderLookupPort();

    await computePlan(fake.port);

    expect(fake.requests.map((request) => request.bindingId)).toEqual([BINDING, BINDING_B]);
    for (const request of fake.requests) {
      expect(request.secretSyncId).toBe(SYNC);
      expect(request.organizationId).toBe(ORG);
      expect(request.appConnectionId).toBe(createActiveGitHubSync().appConnectionId);
    }
  });

  it("surfaces sync.overwrite_status_unknown when lookup cannot determine overwrite status", async () => {
    const fake = createFakeProviderLookupPort({
      [BINDING]: PROVIDER_LOOKUP_STATUSES.unavailable,
    });

    const plan = await computePlan(fake.port);

    expect(plan.warningCodes).toEqual([SECRET_SYNC_ERROR_CODES.overwriteStatusUnknown]);
    expect(plan.bindings[0]?.targetExistence).toBe("provider_target.unknown");
  });

  it("rejects syncs outside the requested project/environment coordinate", async () => {
    getSecretSyncById.mockResolvedValue(
      createActiveGitHubSync({ projectId: projectId.brand("prj_00000000000000000000000002") }),
    );

    await expect(computePlan(createFakeProviderLookupPort().port)).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.notFound,
    });
  });

  it("computes a stable fingerprint that changes when configuration or lookup status changes", async () => {
    const first = await computePlan(createFakeProviderLookupPort().port);
    const second = await computePlan(createFakeProviderLookupPort().port);
    expect(second.fingerprint).toBe(first.fingerprint);

    const drifted = await computePlan(
      createFakeProviderLookupPort({ [BINDING]: PROVIDER_LOOKUP_STATUSES.found }).port,
    );
    expect(drifted.fingerprint).not.toBe(first.fingerprint);

    getSecretSyncById.mockResolvedValue(
      createActiveGitHubSync({ updatedAt: new Date("2026-02-01T00:00:00.000Z") }),
    );
    const reconfigured = await computePlan(createFakeProviderLookupPort().port);
    expect(reconfigured.fingerprint).not.toBe(first.fingerprint);
  });

  it("keeps plan output and audit details free of provider names and sensitive values", async () => {
    const plan = await computePlan(createFakeProviderLookupPort().port);

    const details = toPlanBindingAuditDetails(plan);
    expect(() => assertMetadataSafeDetailMap(details)).not.toThrow();
    expect(JSON.stringify(plan)).not.toMatch(/DATABASE_URL|hunter2|provider_destination/i);
  });
});

describe("planSecretSyncCommand", () => {
  it("writes a metadata-safe sync.plan_completed audit event on success", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();
    const fake = createFakeProviderLookupPort({ [BINDING]: PROVIDER_LOOKUP_STATUSES.found });

    const result = await planSecretSyncCommand({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretSyncId: SYNC,
      lookupPorts: { "github-actions": fake.port },
      requestId: REQUEST,
    });

    expect(result.plan.overwriteWarningCount).toBe(1);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.syncPlanCompleted,
        outcome: "success",
        details: expect.objectContaining({
          bindingCount: 2,
          overwriteWarningCount: 1,
          lookupStatus1: "provider_lookup.found",
          overwriteWarning1: true,
        }),
      }),
    );
  });

  it("audits sync.plan_denied with the stable reason code when access is denied", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();
    vi.mocked(resolveSecretSyncRunAccess).mockRejectedValueOnce(
      new SecretSyncError(AUTH_ERROR_CODES.insufficientScope, "secret sync run scope required"),
    );

    await expect(
      planSecretSyncCommand({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretSyncId: SYNC,
        lookupPorts: { "github-actions": createFakeProviderLookupPort().port },
        requestId: REQUEST,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.syncPlanDenied,
        outcome: "denied",
        denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope },
      }),
    );
  });

  it("audits sync.plan_denied when the sync's connection is disabled", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();
    getConnectionById.mockResolvedValue(createGitHubConnection({ status: "disconnected" }));

    await expect(
      planSecretSyncCommand({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretSyncId: SYNC,
        lookupPorts: { "github-actions": createFakeProviderLookupPort().port },
        requestId: REQUEST,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.connectionNotEligible });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.syncPlanDenied,
        denial: { reasonCode: SECRET_SYNC_ERROR_CODES.connectionNotEligible },
      }),
    );
  });

  it("fails closed with provider.unavailable when no lookup adapter is registered", async () => {
    spyWriteAuditEventWithRealValidation();

    await expect(
      planSecretSyncCommand({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretSyncId: SYNC,
        lookupPorts: {},
        requestId: REQUEST,
      }),
    ).rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.unavailable });
  });
});
