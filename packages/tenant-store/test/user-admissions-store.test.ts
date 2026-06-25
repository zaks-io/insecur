import { userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userAdmissions } from "../src/db/schema/instance-bootstrap.js";
import { collectPgTableExportsFromModule } from "../src/db/schema/schema-tables.js";
import {
  materializePgTableExtraConfig,
  materializePgTableExtraConfigs,
} from "./helpers/materialize-pg-table-extra-config.js";
import * as instanceBootstrapSchema from "../src/db/schema/instance-bootstrap.js";
import {
  insertActiveUserAdmissionInTransaction,
  resolveActiveUserAdmission,
  resolveAdmittedUserId,
  revokeUserAdmission,
  seedActiveUserAdmission,
} from "../src/user-admissions/tenant-user-admission-store.js";

vi.mock("../src/with-tenant-scope.js", () => ({
  withTenantScope: vi.fn(),
}));

import { withTenantScope } from "../src/with-tenant-scope.js";

const mockedWithTenantScope = vi.mocked(withTenantScope);

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_01workos";
const admittedUser = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

function mockServiceSql(rows: unknown[]): void {
  mockedWithTenantScope.mockImplementationOnce(async (_scope, run) => {
    const sql = vi.fn().mockResolvedValue(rows);
    return await run({ sql } as never);
  });
}

describe("userAdmissions schema", () => {
  it("materializes constraint builders for coverage", () => {
    materializePgTableExtraConfig(userAdmissions);
    materializePgTableExtraConfigs(
      collectPgTableExportsFromModule(instanceBootstrapSchema as Record<string, unknown>),
    );
  });
});

describe("resolveActiveUserAdmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no active row exists", async () => {
    mockServiceSql([]);
    await expect(resolveActiveUserAdmission(instanceId, workosUserId)).resolves.toBeNull();
  });

  it("maps an active row including a valid display name", async () => {
    mockServiceSql([
      {
        user_id: admittedUser,
        workos_user_id: workosUserId,
        display_name: "Operator",
      },
    ]);
    await expect(resolveActiveUserAdmission(instanceId, workosUserId)).resolves.toEqual({
      userId: admittedUser,
      workosUserId,
      displayName: "Operator",
    });
  });

  it("drops invalid display names", async () => {
    mockServiceSql([
      {
        user_id: admittedUser,
        workos_user_id: workosUserId,
        display_name: "",
      },
    ]);
    await expect(resolveActiveUserAdmission(instanceId, workosUserId)).resolves.toEqual({
      userId: admittedUser,
      workosUserId,
      displayName: null,
    });
  });
});

describe("resolveAdmittedUserId", () => {
  it("returns only the user id", async () => {
    mockServiceSql([
      {
        user_id: admittedUser,
        workos_user_id: workosUserId,
        display_name: null,
      },
    ]);
    await expect(resolveAdmittedUserId(instanceId, workosUserId)).resolves.toBe(admittedUser);
  });
});

describe("seedActiveUserAdmission", () => {
  it("upserts through the service scope", async () => {
    const sql = vi.fn().mockResolvedValue(undefined);
    mockedWithTenantScope.mockImplementationOnce(async (_scope, run) => {
      return await run({ sql } as never);
    });

    await seedActiveUserAdmission({
      admissionId: "uad_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
      instanceId,
      userId: admittedUser,
      workosUserId,
      displayName: "Seeded",
    });

    expect(sql).toHaveBeenCalledOnce();
  });
});

describe("insertActiveUserAdmissionInTransaction", () => {
  it("inserts within the provided transaction", async () => {
    const sql = vi.fn().mockResolvedValue(undefined);
    await insertActiveUserAdmissionInTransaction(sql as never, {
      admissionId: "uad_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
      instanceId,
      userId: admittedUser,
      workosUserId,
    });
    expect(sql).toHaveBeenCalledOnce();
  });
});

describe("revokeUserAdmission", () => {
  it("returns null when no active admission was revoked", async () => {
    mockServiceSql([]);
    await expect(revokeUserAdmission(instanceId, workosUserId)).resolves.toBeNull();
  });

  it("returns the revoked user id", async () => {
    mockServiceSql([{ user_id: admittedUser }]);
    await expect(revokeUserAdmission(instanceId, workosUserId)).resolves.toBe(admittedUser);
  });
});
