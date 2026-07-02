import { userId } from "@insecur/domain";
import { TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS } from "@insecur/token-signing";
import { describe, expect, it } from "vitest";
import { INSECUR_API_TOKEN_AUDIENCE, INSECUR_RUNTIME_TOKEN_AUDIENCE } from "./constants.js";
import { mintEphemeralSessionCredential } from "./ephemeral-session.js";
import { decodeHmacToken, encodeHmacToken } from "./hmac-token.js";
import { mintScopedAccessToken, verifyScopedAccessToken } from "./scoped-access-token.js";
import { testSessionSigningSecret } from "./testing/test-session-signing-secret.js";
import type { UserActor } from "./user-actor.js";

const signingSecret = testSessionSigningSecret();

const actor: UserActor = {
  type: "user",
  userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  workosUserId: "user_01workos",
  sessionId: "session_01test",
};

describe("scoped access token", () => {
  it("round-trips a runtime-audience token", async () => {
    const minted = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    const verified = await verifyScopedAccessToken({
      token: minted.token,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.actor.userId).toBe(actor.userId);
      expect(verified.actor.workosUserId).toBe(actor.workosUserId);
      expect(verified.actor.sessionId).toBe(actor.sessionId);
    }
  });

  it("rejects a token minted for a different audience", async () => {
    const minted = await mintScopedAccessToken({
      actor,
      audience: INSECUR_API_TOKEN_AUDIENCE,
      signingSecret,
    });
    const verified = await verifyScopedAccessToken({
      token: minted.token,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("audience_mismatch");
    }
  });

  it("rejects tampered tokens", async () => {
    const minted = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    const verified = await verifyScopedAccessToken({
      token: `${minted.token}x`,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects tokens signed with a different secret", async () => {
    const minted = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    const verified = await verifyScopedAccessToken({
      token: minted.token,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret: `${signingSecret}deadbeef`,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects expired tokens", async () => {
    const minted = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
      ttlSeconds: -10,
    });
    const verified = await verifyScopedAccessToken({
      token: minted.token,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("expired");
    }
  });

  it("rejects tokens with iat meaningfully in the future", async () => {
    const minted = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    const claims = await decodeHmacToken(minted.token, signingSecret);
    if (claims === null) {
      throw new Error("expected decoded scoped access token claims");
    }
    const now = Math.floor(Date.now() / 1000);
    const resigned = await encodeHmacToken(
      {
        ...claims,
        iat: now + TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS + 120,
        exp: now + TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS + 300,
      },
      signingSecret,
    );
    const verified = await verifyScopedAccessToken({
      token: resigned,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects a CLI ephemeral session credential presented as a scoped token", async () => {
    const ephemeral = await mintEphemeralSessionCredential({ actor, signingSecret });
    const verified = await verifyScopedAccessToken({
      token: ephemeral.credential,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });
});
