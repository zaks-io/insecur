import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  mintEphemeralSessionCredential,
  verifyEphemeralSessionCredential,
} from "./ephemeral-session.js";
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
});
