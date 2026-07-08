import {
  recordInjectionGrantRevocationAuditInTenantScope,
  type RecordInjectionGrantRevocationAuditInput,
} from "@insecur/audit";
import { auditEventId, injectionGrantId, organizationId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeInjectionGrantsForTenantSuspension } from "../src/revoke-injection-grants.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const GRANT_ONE = injectionGrantId.brand("igr_00000000000000000000000001");
const AUDIT_EVENT = auditEventId.brand("aud_00000000000000000000000001");

interface MockTransactionState {
  revoked: boolean;
}

const { committedRevocations, revokeActiveGrantsForOrganization, withTenantScope } = vi.hoisted(
  () => ({
    committedRevocations: [] as MockTransactionState[],
    revokeActiveGrantsForOrganization: vi.fn(async (state: MockTransactionState) => {
      state.revoked = true;
      return [GRANT_ONE];
    }),
    withTenantScope: vi.fn(
      async (
        _scope: unknown,
        fn: (ctx: { db: MockTransactionState; sql: unknown }) => Promise<unknown>,
      ) => {
        const state = { revoked: false };
        try {
          const result = await fn({ db: state, sql: {} });
          committedRevocations.push(state);
          return result;
        } catch (error) {
          return Promise.reject(error);
        }
      },
    ),
  }),
);

beforeEach(() => {
  committedRevocations.length = 0;
  revokeActiveGrantsForOrganization.mockClear();
  withTenantScope.mockClear();
  vi.mocked(recordInjectionGrantRevocationAuditInTenantScope).mockReset();
  vi.mocked(recordInjectionGrantRevocationAuditInTenantScope).mockResolvedValue({
    auditEventId: AUDIT_EVENT,
  });
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantInjectionGrantStore {
    constructor(private readonly state: MockTransactionState) {}

    async revokeActiveGrantsForOrganization() {
      return revokeActiveGrantsForOrganization(this.state);
    }
  }
  return {
    ...actual,
    withTenantScope,
    TenantInjectionGrantStore: MockTenantInjectionGrantStore,
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordInjectionGrantRevocationAuditInTenantScope: vi.fn(
      actual.recordInjectionGrantRevocationAuditInTenantScope,
    ),
  };
});

describe("revokeInjectionGrantsForTenantSuspension", () => {
  it("records the success audit in the same tenant-scoped transaction", async () => {
    const result = await revokeInjectionGrantsForTenantSuspension({
      organizationId: ORG,
      actor: { type: "user", userId: "usr_00000000000000000000000001" },
    });

    expect(withTenantScope).toHaveBeenCalledOnce();
    expect(revokeActiveGrantsForOrganization).toHaveBeenCalledOnce();
    expect(recordInjectionGrantRevocationAuditInTenantScope).toHaveBeenCalledOnce();
    expect(recordInjectionGrantRevocationAuditInTenantScope).toHaveBeenCalledWith(
      {},
      expect.objectContaining<RecordInjectionGrantRevocationAuditInput>({
        verb: "tenant_suspension",
        outcome: "success",
        organizationId: ORG,
        revokedGrantCount: 1,
      }),
    );
    expect(result).toEqual({
      revokedGrantIds: [GRANT_ONE],
      auditEventId: AUDIT_EVENT,
    });
    expect(committedRevocations).toEqual([{ revoked: true }]);
  });

  it("rolls back grant revocation when the success audit insert fails", async () => {
    vi.mocked(recordInjectionGrantRevocationAuditInTenantScope).mockRejectedValueOnce(
      new Error("audit insert failed"),
    );

    await expect(
      revokeInjectionGrantsForTenantSuspension({
        organizationId: ORG,
        actor: { type: "user", userId: "usr_00000000000000000000000001" },
      }),
    ).rejects.toThrow("audit insert failed");

    expect(revokeActiveGrantsForOrganization).toHaveBeenCalledOnce();
    expect(recordInjectionGrantRevocationAuditInTenantScope).toHaveBeenCalledOnce();
    expect(committedRevocations).toEqual([]);
  });
});
