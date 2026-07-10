import { agentSessionId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { mintDerivedAgentSessionCredential } from "./derived-agent-session.js";
import { readSessionCredentialMetadata } from "./session-credential-metadata.js";
import { verifyEphemeralSessionCredential } from "./ephemeral-session.js";
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

  it("binds explicit task scopes and resource limits into the derived credential", async () => {
    const parentExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const minted = await mintDerivedAgentSessionCredential({
      actor,
      signingSecret,
      parentExpiresAt,
      credentialScopes: ["secret:read", "runtime_injection:run"],
      projectId: "prj_00000000000000000000000001" as never,
      environmentId: "env_00000000000000000000000001" as never,
      ttlSeconds: 600,
    });

    const metadata = await readSessionCredentialMetadata(minted.credential, signingSecret);
    expect(metadata.credentialScopes).toEqual(["secret:read", "runtime_injection:run"]);
    expect(metadata.projectId).toBe("prj_00000000000000000000000001");
    expect(metadata.environmentId).toBe("env_00000000000000000000000001");
    expect(Date.parse(metadata.expiresAt)).toBeLessThanOrEqual(Date.now() + 600_000);
    const verified = await verifyEphemeralSessionCredential(minted.credential, signingSecret);
    expect(verified).toMatchObject({
      ok: true,
      actor: {
        credentialScopes: ["secret:read", "runtime_injection:run"],
        tokenScope: {
          projectId: "prj_00000000000000000000000001",
          environmentId: "env_00000000000000000000000001",
        },
      },
    });
  });
});
