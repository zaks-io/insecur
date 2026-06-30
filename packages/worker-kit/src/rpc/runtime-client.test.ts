import {
  INSECUR_RUNTIME_TOKEN_AUDIENCE,
  testSessionSigningSecret,
  verifyScopedAccessToken,
  type UserActor,
} from "@insecur/auth";
import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { CreateInvitationResult } from "@insecur/onboarding";
import type { RuntimeRpc, RuntimeRpcResult } from "./runtime-rpc-contract.js";
import { runtimeClientFor, type RuntimeClientEnv } from "./runtime-client.js";
import { RuntimeRpcResultError } from "./unwrap-runtime-result.js";

const SIGNING_SECRET = testSessionSigningSecret();

const actor: UserActor = {
  type: "user",
  userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  workosUserId: "user_01workos",
  sessionId: "session_01test",
};

interface CapturedCall {
  readonly method: string;
  readonly input: Record<string, unknown>;
}

/**
 * A fake `RuntimeRpc` that records every call and returns a caller-supplied result. Only the methods
 * a test drives need a real body; the rest throw so an accidental call is loud.
 */
function fakeRuntime(result: RuntimeRpcResult<unknown>): {
  rpc: RuntimeRpc;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const record =
    (method: string) =>
    (input: Record<string, unknown>): Promise<RuntimeRpcResult<unknown>> => {
      calls.push({ method, input });
      return Promise.resolve(result);
    };
  const rpc = new Proxy({} as RuntimeRpc, {
    get: (_t, method: string) => record(method),
  });
  return { rpc, calls };
}

function envWith(rpc: RuntimeRpc): RuntimeClientEnv {
  return { RUNTIME: rpc, RUNTIME_TOKEN_SIGNING_SECRET: SIGNING_SECRET };
}

describe("runtimeClientFor", () => {
  it("mints a verifiable hop token and forwards it with the input", async () => {
    const { rpc, calls } = fakeRuntime({ ok: true, value: { invitationId: "inv_1" } });

    const result = await runtimeClientFor(envWith(rpc), actor).createInvitation({
      organizationId: "org_1" as never,
      inviteeUserId: "usr_invitee" as never,
      rolePreset: "member",
      requestId: "req_1" as never,
    });

    // The client unwraps to the precise success payload, not the RuntimeRpcResult union and not
    // `never` (a non-distributing unwrap conditional silently collapses to `never`).
    expectTypeOf(result).toEqualTypeOf<CreateInvitationResult>();

    expect(result).toEqual({ invitationId: "inv_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("createInvitation");
    expect(calls[0]?.input).toMatchObject({ organizationId: "org_1", rolePreset: "member" });

    const token = calls[0]?.input.actorToken as string;
    const verified = await verifyScopedAccessToken({
      token,
      expectedAudience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret: SIGNING_SECRET,
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.actor.userId).toBe(actor.userId);
    }
  });

  it("throws the shaped RuntimeRpcResultError on a failure result", async () => {
    const { rpc } = fakeRuntime({
      ok: false,
      error: { code: AUTH_ERROR_CODES.invalid, message: "denied", retryable: false },
    });

    await expect(
      runtimeClientFor(envWith(rpc), actor).getOperation({
        organizationId: "org_1" as never,
        operationId: "op_1" as never,
        requestId: "req_1" as never,
      }),
    ).rejects.toMatchObject({
      name: "RuntimeRpcResultError",
      code: AUTH_ERROR_CODES.invalid,
      retryable: false,
    } satisfies Partial<RuntimeRpcResultError>);
  });

  it("mints the hop token once and reuses it across calls on the same client", async () => {
    const { rpc, calls } = fakeRuntime({ ok: true, value: { invitationId: "inv_1" } });
    const client = runtimeClientFor(envWith(rpc), actor);

    await client.createInvitation({
      organizationId: "org_1" as never,
      inviteeUserId: "usr_a" as never,
      rolePreset: "member",
      requestId: "req_1" as never,
    });
    await client.acceptInvitation({
      organizationId: "org_1" as never,
      invitationId: "inv_1" as never,
      requestId: "req_2" as never,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.input.actorToken).toBe(calls[1]?.input.actorToken);
  });
});
