import {
  environmentId,
  organizationId,
  projectId,
  secretId,
  type VariableKey,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import type { TenantScopedDb } from "../src/tenant-scoped-db.js";
import { listSecretMatrixRowsByProject } from "../src/secrets/secret-matrix-metadata-queries.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const VARIABLE_KEY = "DATABASE_URL" as VariableKey;

function createMatrixDb(
  handlers: {
    readonly joinRows?: readonly Record<string, unknown>[];
    readonly draftRows?: readonly Record<string, unknown>[];
    readonly auditRows?: readonly Record<string, unknown>[];
  } = {},
): TenantScopedDb {
  let selectCall = 0;
  const joinRows = handlers.joinRows ?? [];
  const draftRows = handlers.draftRows ?? [];
  const auditRows = handlers.auditRows ?? [];

  const orderBy = vi.fn(async () => {
    selectCall += 1;
    if (selectCall === 1) {
      return joinRows;
    }
    if (selectCall === 2) {
      return draftRows;
    }
    return auditRows;
  });
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const leftJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ leftJoin, innerJoin, where }));
  const select = vi.fn(() => ({ from }));

  return { select } as unknown as TenantScopedDb;
}

describe("listSecretMatrixRowsByProject", () => {
  it("returns an empty list when the project has no secrets", async () => {
    const db = createMatrixDb();
    await expect(
      listSecretMatrixRowsByProject(db, { organizationId: ORG, projectId: PROJECT }),
    ).resolves.toEqual([]);
  });

  it("assembles live-version matrix rows with last-set actor metadata", async () => {
    const secret = secretId.brand("sec_00000000000000000000000001");
    const db = createMatrixDb({
      joinRows: [
        {
          secretId: secret,
          environmentId: ENV,
          variableKey: VARIABLE_KEY,
          currentVersionId: "sv_00000000000000000000000001",
          versionId: "sv_00000000000000000000000001",
          versionNumber: 2,
          lifecycleState: "live",
          publishedAt: new Date("2026-06-24T01:00:00.000Z"),
          versionCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
          secretCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
        },
      ],
      auditRows: [
        {
          resourceKey: secret,
          actorType: "user",
          actorUserId: "usr_00000000000000000000000001",
          actorMachineIdentityId: null,
          createdAt: new Date("2026-06-24T01:00:00.000Z"),
        },
      ],
    });

    const rows = await listSecretMatrixRowsByProject(db, {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        secretId: secret,
        environmentId: ENV,
        variableKey: VARIABLE_KEY,
        versionNumber: 2,
        lifecycleState: "live",
        lastSetActor: {
          actorType: "user",
          userId: "usr_00000000000000000000000001",
          machineIdentityId: null,
        },
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/ciphertext|valueUtf8|wrapped/i);
  });

  it("skips rows whose stored secret version id is not a valid sv_ opaque id", async () => {
    const db = createMatrixDb({
      joinRows: [
        {
          secretId: secretId.brand("sec_00000000000000000000000001"),
          environmentId: ENV,
          variableKey: VARIABLE_KEY,
          currentVersionId: "secv_00000000000000000000000001",
          versionId: "secv_00000000000000000000000001",
          versionNumber: 2,
          lifecycleState: "live",
          publishedAt: new Date("2026-06-24T01:00:00.000Z"),
          versionCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
          secretCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      listSecretMatrixRowsByProject(db, { organizationId: ORG, projectId: PROJECT }),
    ).resolves.toEqual([]);
  });

  it("falls back to the latest draft version when no live version exists", async () => {
    const secret = secretId.brand("sec_00000000000000000000000002");
    const db = createMatrixDb({
      joinRows: [
        {
          secretId: secret,
          environmentId: ENV,
          variableKey: VARIABLE_KEY,
          currentVersionId: null,
          versionId: null,
          versionNumber: null,
          lifecycleState: null,
          publishedAt: null,
          versionCreatedAt: null,
          secretCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
        },
      ],
      draftRows: [
        {
          secretId: secret,
          secretVersionId: "sv_00000000000000000000000002",
          versionNumber: 1,
          lifecycleState: "draft",
          createdAt: new Date("2026-06-25T00:00:00.000Z"),
        },
      ],
    });

    const rows = await listSecretMatrixRowsByProject(db, {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows[0]).toMatchObject({
      versionNumber: 1,
      lifecycleState: "draft",
    });
  });

  it("does not fall back to draft when the live pointer is malformed", async () => {
    const secret = secretId.brand("sec_00000000000000000000000003");
    const db = createMatrixDb({
      joinRows: [
        {
          secretId: secret,
          environmentId: ENV,
          variableKey: VARIABLE_KEY,
          currentVersionId: "secv_00000000000000000000000001",
          versionId: "secv_00000000000000000000000001",
          versionNumber: 2,
          lifecycleState: "live",
          publishedAt: new Date("2026-06-24T01:00:00.000Z"),
          versionCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
          secretCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
        },
      ],
      draftRows: [
        {
          secretId: secret,
          secretVersionId: "sv_00000000000000000000000002",
          versionNumber: 1,
          lifecycleState: "draft",
          createdAt: new Date("2026-06-25T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      listSecretMatrixRowsByProject(db, { organizationId: ORG, projectId: PROJECT }),
    ).resolves.toEqual([]);
  });

  it("skips malformed machine last-set actors and uses the next valid audit event", async () => {
    const secret = secretId.brand("sec_00000000000000000000000004");
    const db = createMatrixDb({
      joinRows: [
        {
          secretId: secret,
          environmentId: ENV,
          variableKey: VARIABLE_KEY,
          currentVersionId: "sv_00000000000000000000000001",
          versionId: "sv_00000000000000000000000001",
          versionNumber: 2,
          lifecycleState: "live",
          publishedAt: new Date("2026-06-24T01:00:00.000Z"),
          versionCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
          secretCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
        },
      ],
      auditRows: [
        {
          resourceKey: secret,
          actorType: "machine",
          actorUserId: null,
          actorMachineIdentityId: null,
          createdAt: new Date("2026-06-24T02:00:00.000Z"),
        },
        {
          resourceKey: secret,
          actorType: "user",
          actorUserId: "usr_00000000000000000000000001",
          actorMachineIdentityId: null,
          createdAt: new Date("2026-06-24T01:00:00.000Z"),
        },
      ],
    });

    const rows = await listSecretMatrixRowsByProject(db, {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows[0]?.lastSetActor).toEqual({
      actorType: "user",
      userId: "usr_00000000000000000000000001",
      machineIdentityId: null,
    });
  });
});
