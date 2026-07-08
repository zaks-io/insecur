import { userId } from "@insecur/domain";
import { TOKEN_ISSUED_AT_FUTURE_SKEW_SECONDS } from "@insecur/token-signing";
import { describe, expect, it } from "vitest";
import {
  mintEphemeralSessionCredential,
  verifyEphemeralSessionCredential,
} from "./ephemeral-session.js";
import { mintDerivedAgentSessionCredential } from "./derived-agent-session.js";
import { decodeHmacToken, encodeHmacToken } from "./hmac-token.js";
import { testSessionSigningSecret } from "./testing/test-session-signing-secret.js";
import type { UserActor } from "./user-actor.js";

const signingSecret = testSessionSigningSecret();

const actor: UserActor = {
  type: "user",
  userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  workosUserId: "user_01workos",
  sessionId: "session_01test",
};

describe("ephemeral session credentials", () => {
  it("round-trips a valid credential", async () => {
    const minted = await mintEphemeralSessionCredential({ actor, signingSecret });
    const verified = await verifyEphemeralSessionCredential(minted.credential, signingSecret);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.actor.userId).toBe(actor.userId);
      expect(verified.actor.workosUserId).toBe(actor.workosUserId);
    }
  });

  it("rejects tampered credentials", async () => {
    const minted = await mintEphemeralSessionCredential({ actor, signingSecret });
    const tampered = `${minted.credential}x`;
    const verified = await verifyEphemeralSessionCredential(tampered, signingSecret);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects malformed three-part credentials with invalid base64 signature", async () => {
    const verified = await verifyEphemeralSessionCredential("a.b.!", signingSecret);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects expired credentials", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor,
      signingSecret,
      ttlSeconds: -10,
    });
    const verified = await verifyEphemeralSessionCredential(minted.credential, signingSecret);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("expired");
    }
  });

  it("rejects credentials with iat meaningfully in the future", async () => {
    const minted = await mintEphemeralSessionCredential({ actor, signingSecret });
    const claims = await decodeHmacToken(minted.credential, signingSecret);
    if (claims === null) {
      throw new Error("expected decoded credential claims");
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
    const verified = await verifyEphemeralSessionCredential(resigned, signingSecret);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("accepts derived agent-marked CLI session credentials", async () => {
    const minted = await mintDerivedAgentSessionCredential({
      actor,
      signingSecret,
      parentExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const verified = await verifyEphemeralSessionCredential(minted.credential, signingSecret);
    expect(verified.ok).toBe(true);
  });
});
