import { userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearHighAssuranceChallengeOperation } from "../operations/clear-high-assurance-challenge-operation.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";
import { clearHighAssuranceChallengeRpc } from "./runtime-high-assurance-rpc-delegates.js";

vi.mock("../operations/clear-high-assurance-challenge-operation.js", () => ({
  clearHighAssuranceChallengeOperation: vi.fn(),
}));

const clearingUserId = userId.brand("usr_00000000000000000000000001");

describe("runtime high-assurance RPC delegates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clearHighAssuranceChallengeOperation).mockResolvedValue({
      operationId: "op_00000000000000000000000001",
      challengeId: "challenge_test_token_001",
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId,
    } as never);
  });

  it("passes the authenticated agent marker to clear authorization", async () => {
    const post = vi.fn(async (_actorToken, run) => ({
      ok: true as const,
      value: await run({
        actor: {
          type: "user" as const,
          userId: clearingUserId,
          workosUserId: "user_test",
          sessionId: "session_test",
          agentMarked: true,
        },
        auditActor: { type: "user" as const, userId: clearingUserId },
        accessActor: { type: "user" as const, userId: clearingUserId },
      }),
    })) as PostAuthRpcRunner;

    await clearHighAssuranceChallengeRpc(post, {
      actorToken: "token",
    } as never);

    expect(clearHighAssuranceChallengeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        clearingUserId,
        clearingCredentialAgentMarked: true,
      }),
    );
  });
});
