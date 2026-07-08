import { agentSessionId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTenantScope, mockSql } = vi.hoisted(() => ({
  withTenantScope: vi.fn(),
  mockSql: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope,
}));

import { registerAgentSession } from "../src/agent-session-store.js";

const actorUserId = userId.generate();
const existingSessionId = agentSessionId.generate();

describe("registerAgentSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withTenantScope.mockImplementation(async (_scope, fn) => {
      return await fn({ sql: mockSql });
    });
  });

  it("returns the re-selected row after a duplicate insert is ignored", async () => {
    const input = {
      humanSessionId: "session_conflict_unit",
      userId: actorUserId,
      harnessName: "agent.harness.test",
      ancestryKey: "ancestry_conflict_unit",
    };

    let sqlCall = 0;
    mockSql.mockImplementation(() => {
      sqlCall += 1;
      if (sqlCall === 1) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: existingSessionId,
          user_id: actorUserId,
          human_session_id: input.humanSessionId,
          harness_name: input.harnessName,
          ancestry_key: input.ancestryKey,
          tier: "registered",
        },
      ]);
    });

    const result = await registerAgentSession(input);

    expect(result).toBe(existingSessionId);
    expect(withTenantScope).toHaveBeenCalledTimes(1);
    const insertCall = mockSql.mock.calls[0];
    expect(insertCall).toBeDefined();
    expect(insertCall?.[0].join(" ")).toContain("ON CONFLICT");
  });
});
