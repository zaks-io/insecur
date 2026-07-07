import { agentSessionId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAttributionTier, assertOrganizationMembership } = vi.hoisted(() => ({
  resolveAttributionTier: vi.fn(),
  assertOrganizationMembership: vi.fn(),
}));

vi.mock("../src/agent-session-store.js", () => ({
  findActiveAgentSession: vi.fn(),
  registerAgentSession: vi.fn(),
  resolveAttributionTier,
}));

vi.mock("@insecur/access", () => ({
  assertOrganizationMembership,
}));

import { resolveSessionWhoami } from "../src/resolve-session-whoami.js";

const actorUserId = userId.generate();
const derivedSessionId = agentSessionId.generate();

describe("resolveSessionWhoami", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns derived attribution when agent-marked", async () => {
    resolveAttributionTier.mockResolvedValue({
      tier: "derived",
      agentSessionId: derivedSessionId,
      harnessName: "agent.harness.claude_code",
    });

    const result = await resolveSessionWhoami({
      userId: actorUserId,
      sessionId: "session_human",
      sessionExpiresAt: "2026-07-08T00:00:00.000Z",
      agentMarked: true,
      derivedAgentSessionId: derivedSessionId,
      harnessName: "agent.harness.claude_code",
    });

    expect(result).toEqual({
      sessionValid: true,
      sessionExpiresAt: "2026-07-08T00:00:00.000Z",
      resolvedContext: {},
      attribution: {
        tier: "derived",
        agentSessionId: derivedSessionId,
        harnessName: "agent.harness.claude_code",
      },
    });
    expect(resolveAttributionTier).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMarked: true,
        derivedAgentSessionId: derivedSessionId,
      }),
    );
  });

  it("returns tag-only attribution without context", async () => {
    resolveAttributionTier.mockResolvedValue({
      tier: "tag-only",
      tag: "my-agent",
    });

    const result = await resolveSessionWhoami({
      userId: actorUserId,
      sessionId: "session_human",
      sessionExpiresAt: "2026-07-08T00:00:00.000Z",
      agentMarked: false,
      agentTag: "my-agent",
    });

    expect(result.attribution).toEqual({ tier: "tag-only", tag: "my-agent" });
    expect(assertOrganizationMembership).not.toHaveBeenCalled();
  });
});
