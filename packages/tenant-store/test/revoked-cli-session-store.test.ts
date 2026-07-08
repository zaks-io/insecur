import { userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCliSessionRevoked,
  pruneExpiredRevokedCliSessions,
  revokeCliSession,
} from "../src/cli-sessions/tenant-revoked-cli-session-store.js";

vi.mock("../src/with-tenant-scope.js", () => ({
  withTenantScope: vi.fn(),
}));

import { withTenantScope } from "../src/with-tenant-scope.js";

const mockedWithTenantScope = vi.mocked(withTenantScope);

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const sessionId = "session_cli_revoke_test";
const admittedUser = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const sessionExpiresAt = "2026-07-09T00:00:00.000Z";

function mockServiceSql(rows: unknown[]): void {
  mockedWithTenantScope.mockImplementationOnce(async (_scope, run) => {
    const sql = vi.fn().mockResolvedValue(rows);
    return await run({ sql } as never);
  });
}

describe("revoked cli session store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a new revocation with session expiry", async () => {
    mockServiceSql([{ session_id: sessionId }]);
    mockServiceSql([]);
    await expect(
      revokeCliSession(instanceId, sessionId, admittedUser, sessionExpiresAt),
    ).resolves.toEqual({
      revoked: true,
    });
  });

  it("is idempotent when the session was already revoked", async () => {
    mockServiceSql([{ session_id: sessionId }]);
    mockServiceSql([]);
    await expect(
      revokeCliSession(instanceId, sessionId, admittedUser, sessionExpiresAt),
    ).resolves.toEqual({
      revoked: true,
    });
  });

  it("reports revoked sessions that have not expired", async () => {
    mockServiceSql([{ session_id: sessionId }]);
    await expect(isCliSessionRevoked(instanceId, sessionId)).resolves.toBe(true);
  });

  it("reports active sessions as not revoked", async () => {
    mockServiceSql([]);
    await expect(isCliSessionRevoked(instanceId, sessionId)).resolves.toBe(false);
  });

  it("prunes expired revocation rows", async () => {
    mockServiceSql([{ session_id: sessionId }, { session_id: "session_other" }]);
    await expect(pruneExpiredRevokedCliSessions(instanceId)).resolves.toBe(2);
  });
});
