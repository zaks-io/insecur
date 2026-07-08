import { agentSessionId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { mintDerivedAgentSessionCredential } from "./derived-agent-session.js";
import { readSessionCredentialMetadata } from "./session-credential-metadata.js";
import { testSessionSigningSecret } from "./testing/index.js";

const signingSecret = testSessionSigningSecret();
const actor = {
  type: "user" as const,
  userId: userId.brand("usr_00000000000000000000000011"),
  workosUserId: "user_test",
  sessionId: "session_derive_test",
};

describe("mintDerivedAgentSessionCredential", () => {
  it("mints an agent-marked credential with a derived agent session id", async () => {
    const parentExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const minted = await mintDerivedAgentSessionCredential({
      actor,
      signingSecret,
      parentExpiresAt,
      harnessName: "agent.harness.claude_code",
    });

    expect(agentSessionId.parse(minted.agentSessionId).ok).toBe(true);
    const metadata = await readSessionCredentialMetadata(minted.credential, signingSecret);
    expect(metadata.agentMarked).toBe(true);
    expect(metadata.derivedAgentSessionId).toBe(minted.agentSessionId);
    expect(metadata.harnessName).toBe("agent.harness.claude_code");
    expect(Date.parse(metadata.expiresAt)).toBeLessThanOrEqual(Date.parse(parentExpiresAt));
  });

  it("fails closed when the parent session is already expired", async () => {
    await expect(
      mintDerivedAgentSessionCredential({
        actor,
        signingSecret,
        parentExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "auth.expired" });
  });
});
