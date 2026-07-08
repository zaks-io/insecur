import { agentSessionId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { INSECUR_API_TOKEN_AUDIENCE, INSECUR_RUNTIME_TOKEN_AUDIENCE } from "./constants.js";
import { mintEphemeralSessionCredential } from "./ephemeral-session.js";
import { encodeHmacToken } from "./hmac-token.js";
import { readSessionCredentialMetadata } from "./session-credential-metadata.js";
import { mintScopedAccessToken } from "./scoped-access-token.js";
import { testSessionSigningSecret } from "./testing/index.js";

const signingSecret = testSessionSigningSecret();
const actor = {
  type: "user" as const,
  userId: userId.brand("usr_00000000000000000000000011"),
  workosUserId: "user_test",
  sessionId: "session_metadata_test",
};

describe("readSessionCredentialMetadata", () => {
  it("reads CLI session credential metadata", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor,
      signingSecret,
    });

    const metadata = await readSessionCredentialMetadata(minted.credential, signingSecret);

    expect(metadata.sessionValid).toBe(true);
    expect(metadata.agentMarked).toBe(false);
    expect(metadata.expiresAt).toEqual(minted.expiresAt);
  });

  it("reads scoped-access credential metadata for the API audience", async () => {
    const scoped = await mintScopedAccessToken({
      actor,
      audience: INSECUR_API_TOKEN_AUDIENCE,
      signingSecret,
    });

    const metadata = await readSessionCredentialMetadata(scoped.token, signingSecret);

    expect(metadata).toEqual({
      expiresAt: scoped.expiresAt,
      sessionValid: true,
      agentMarked: false,
    });
  });

  it("rejects scoped-access credentials minted for the runtime audience", async () => {
    const scoped = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });

    await expect(readSessionCredentialMetadata(scoped.token, signingSecret)).rejects.toMatchObject({
      code: "auth.insufficient_scope",
    });
  });

  it("reads derived agent session metadata from agent-marked CLI credentials", async () => {
    const derivedId = agentSessionId.generate();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtEpoch = issuedAt + 300;
    const credential = await encodeHmacToken(
      {
        sub: actor.userId,
        wid: actor.workosUserId,
        sid: actor.sessionId,
        exp: expiresAtEpoch,
        iat: issuedAt,
        typ: "insecur_cli_agent_session_v1",
        asid: derivedId,
      },
      signingSecret,
    );

    const metadata = await readSessionCredentialMetadata(credential, signingSecret);

    expect(metadata.agentMarked).toBe(true);
    expect(metadata.derivedAgentSessionId).toBe(derivedId);
  });
});
