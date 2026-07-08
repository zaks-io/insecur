import { INJECTION_ERROR_CODES, userId } from "@insecur/domain";
import {
  INSECUR_RUNTIME_TOKEN_AUDIENCE,
  mintScopedAccessToken,
  type UserActor,
} from "@insecur/auth";
import { InjectionGrantError } from "@insecur/runtime-injection";
import { describe, expect, it } from "vitest";

import type { RuntimeEnv } from "../env.js";
import { withRuntimeRpcEntry } from "./runtime-rpc-entry.js";

const RUNTIME_TOKEN_SIGNING_SECRET = "runtime-entry-secret-000000000000000000000000000";
const SENTINEL = "sentinel-plaintext-must-not-cross-seam";

const env = { RUNTIME_TOKEN_SIGNING_SECRET } as RuntimeEnv;

const actor: UserActor = {
  type: "user",
  userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  workosUserId: "user_01workos",
  sessionId: "session_01test",
};

async function mintRuntimeToken(): Promise<string> {
  const minted = await mintScopedAccessToken({
    actor,
    audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
    signingSecret: RUNTIME_TOKEN_SIGNING_SECRET,
  });
  return minted.token;
}

describe("withRuntimeRpcEntry", () => {
  it("verifies the hop token and returns handler success as data", async () => {
    const result = await withRuntimeRpcEntry(
      { env, actorToken: await mintRuntimeToken() },
      async ({ auditActor }) => {
        if (auditActor.type !== "user") {
          throw new Error("expected user audit actor");
        }
        return { echoedUserId: auditActor.userId };
      },
    );
    expect(result).toEqual({
      ok: true,
      value: { echoedUserId: actor.userId },
    });
  });

  it("maps handler failures through toRuntimeRpcError without leaking raw domain text", async () => {
    const result = await withRuntimeRpcEntry(
      { env, actorToken: await mintRuntimeToken() },
      async () => {
        throw new InjectionGrantError(INJECTION_ERROR_CODES.grantExpired, SENTINEL);
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: INJECTION_ERROR_CODES.grantExpired,
        message: "runtime request failed",
        retryable: false,
      },
    });
    if (!result.ok) {
      expect(result.error.message).not.toContain(SENTINEL);
    }
  });

  it("maps hop-token verification failures through the same envelope", async () => {
    const result = await withRuntimeRpcEntry(
      { env, actorToken: "not-a-valid-token" },
      async () => ({ shouldNotRun: true }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.retryable).toBe(false);
      expect(result.error.message).toBe("runtime request failed");
      expect(result.error.message).not.toContain("scoped hop token");
    }
  });

  it("maps an invalid hop-token signing secret to auth.config_invalid", async () => {
    const result = await withRuntimeRpcEntry(
      {
        env: { RUNTIME_TOKEN_SIGNING_SECRET: "short-runtime-hop-secret" } as RuntimeEnv,
        actorToken: await mintRuntimeToken(),
      },
      async () => ({ shouldNotRun: true }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "auth.config_invalid",
        message:
          "runtime configuration invalid: runtimeTokenSigningSecret must be a non-empty value of at least 32 characters",
        retryable: false,
      },
    });
  });
});
