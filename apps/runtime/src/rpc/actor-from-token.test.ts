import { userId } from "@insecur/domain";
import {
  INSECUR_API_TOKEN_AUDIENCE,
  INSECUR_RUNTIME_TOKEN_AUDIENCE,
  mintScopedAccessToken,
  type UserActor,
} from "@insecur/auth";
import { describe, expect, it } from "vitest";

import type { RuntimeEnv } from "../env.js";
import { actorFromHopToken } from "./actor-from-token.js";
import { RuntimeActorTokenError } from "./runtime-rpc-error.js";

const RUNTIME_TOKEN_SIGNING_SECRET = "runtime-hop-secret-0000000000000000000000000000";

const env = { RUNTIME_TOKEN_SIGNING_SECRET } as RuntimeEnv;

const actor: UserActor = {
  type: "user",
  userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  workosUserId: "user_01workos",
  sessionId: "session_01test",
};

async function mintRuntimeToken(audience: string): Promise<string> {
  const minted = await mintScopedAccessToken({
    actor,
    audience,
    signingSecret: RUNTIME_TOKEN_SIGNING_SECRET,
  });
  return minted.token;
}

describe("actorFromHopToken", () => {
  it("recovers the actor from a runtime-audience token", async () => {
    const recovered = await actorFromHopToken(
      env,
      await mintRuntimeToken(INSECUR_RUNTIME_TOKEN_AUDIENCE),
    );
    expect(recovered.userId).toBe(actor.userId);
  });

  it("rejects a token minted for the API audience", async () => {
    await expect(
      actorFromHopToken(env, await mintRuntimeToken(INSECUR_API_TOKEN_AUDIENCE)),
    ).rejects.toBeInstanceOf(RuntimeActorTokenError);
  });

  it("rejects a token signed with a different secret", async () => {
    const foreign = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret: "a-totally-different-secret-0000000000000000000",
    });
    await expect(actorFromHopToken(env, foreign.token)).rejects.toBeInstanceOf(
      RuntimeActorTokenError,
    );
  });

  it("rejects an expired token", async () => {
    const expired = await mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret: RUNTIME_TOKEN_SIGNING_SECRET,
      ttlSeconds: -1,
    });
    await expect(actorFromHopToken(env, expired.token)).rejects.toBeInstanceOf(
      RuntimeActorTokenError,
    );
  });

  it("throws before verifying when the signing secret is missing", async () => {
    await expect(
      actorFromHopToken({ RUNTIME_TOKEN_SIGNING_SECRET: "" } as RuntimeEnv, "token"),
    ).rejects.toMatchObject({ name: "RuntimeTokenSigningSecretConfigError" });
  });

  it("throws before verifying when the signing secret is too short", async () => {
    await expect(
      actorFromHopToken(
        { RUNTIME_TOKEN_SIGNING_SECRET: "short-runtime-hop-secret" } as RuntimeEnv,
        "token",
      ),
    ).rejects.toMatchObject({ name: "RuntimeTokenSigningSecretConfigError" });
  });
});
