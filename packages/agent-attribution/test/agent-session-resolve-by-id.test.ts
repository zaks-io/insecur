import { agentSessionId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTenantScope, mockSql } = vi.hoisted(() => ({
  withTenantScope: vi.fn(),
  mockSql: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope,
}));

import { resolveAttributionTier } from "../src/agent-session-store.js";

const actorUserId = userId.generate();
const persistedSessionId = agentSessionId.generate();
const currentAncestry = "4242";

describe("resolveAttributionTier registered-by-id ancestry binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withTenantScope.mockImplementation(async (_scope, fn) => {
      return await fn({ sql: mockSql });
    });
  });

  it("ignores a persisted agentSessionId when the request ancestry key does not match", async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("WHERE id =")) {
        return Promise.resolve([]);
      }
      if (query.includes("INSERT INTO agent_sessions")) {
        return Promise.resolve([]);
      }
      if (query.includes("ancestry_key =")) {
        return Promise.resolve([
          {
            id: agentSessionId.generate(),
            user_id: actorUserId,
            human_session_id: "session_human",
            harness_name: "agent.harness.test",
            ancestry_key: currentAncestry,
            tier: "registered",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await resolveAttributionTier({
      humanSessionId: "session_human",
      userId: actorUserId,
      agentMarked: false,
      agentSessionId: persistedSessionId,
      harnessName: "agent.harness.test",
      ancestryKey: currentAncestry,
    });

    expect(result.tier).toBe("registered");
    expect(result.agentSessionId).not.toBe(persistedSessionId);
    expect(
      mockSql.mock.calls.some(([strings]) => strings.join(" ").includes("ancestry_key =")),
    ).toBe(true);
  });
});
