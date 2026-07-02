import {
  AUTH_ERROR_CODES,
  environmentId,
  injectionGrantId,
  machineIdentityId,
  organizationId,
  projectId,
} from "@insecur/domain";
import { TenantInjectionGrantStore, withTenantScope } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordInjectionRunCompleted } from "../src/record-injection-run-completed.js";

const mockGetGrant = vi.fn();

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantInjectionGrantStore: vi.fn(function TenantInjectionGrantStoreMock() {
      return {
        getGrant: mockGetGrant,
      };
    }),
  };
});

const ORG = organizationId.brand("org_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");

function grantRow(consumed = true) {
  return {
    project_id: PROJECT,
    environment_id: ENV,
    consumed_at: consumed ? new Date().toISOString() : null,
  };
}

function mockTenantScopeForRunCompleted(): void {
  vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) => {
    const sql = vi.fn(async () => []);
    return fn({ sql, db: {} } as never);
  });
}

describe("recordInjectionRunCompleted grant oracle closure", () => {
  beforeEach(() => {
    vi.mocked(withTenantScope).mockReset();
    mockGetGrant.mockReset();
    vi.mocked(TenantInjectionGrantStore).mockClear();
    mockTenantScopeForRunCompleted();
  });

  it("rejects non-user actors with insufficient_scope before loading the grant", async () => {
    mockGetGrant.mockResolvedValue(grantRow());

    await expect(
      recordInjectionRunCompleted({
        organizationId: ORG,
        grantId: GRANT,
        childExitCode: 0,
        actor: { type: "machine", machineIdentityId: MACHINE },
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(mockGetGrant).not.toHaveBeenCalled();
  });

  it("returns the same code for non-user actors against missing and present grants", async () => {
    mockGetGrant.mockResolvedValue(grantRow());
    const presentGrant = await recordInjectionRunCompleted({
      organizationId: ORG,
      grantId: GRANT,
      childExitCode: 0,
      actor: { type: "ci_exchange" },
    }).catch((error: { code?: string }) => error.code);

    mockGetGrant.mockResolvedValue(null);
    const missingGrant = await recordInjectionRunCompleted({
      organizationId: ORG,
      grantId: GRANT,
      childExitCode: 0,
      actor: { type: "ci_exchange" },
    }).catch((error: { code?: string }) => error.code);

    expect(presentGrant).toBe(AUTH_ERROR_CODES.insufficientScope);
    expect(missingGrant).toBe(AUTH_ERROR_CODES.insufficientScope);
    expect(mockGetGrant).not.toHaveBeenCalled();
  });
});
