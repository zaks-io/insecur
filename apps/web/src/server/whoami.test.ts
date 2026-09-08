import type { UserActor } from "@insecur/auth";
import { userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import type { BffApiClient } from "./bff-api.js";

const resolveMock = vi.hoisted(() => ({ resolveAuthenticatedApiClient: vi.fn() }));

vi.mock("./bff-api.js", () => resolveMock);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: () => unknown) => fn,
  }),
}));

const { loadWhoamiProof } = await import("./whoami.js");

const parsedActorUserId = userId.parse("usr_00000000000000000000000001");
if (!parsedActorUserId.ok) {
  throw new Error("test actor user ID is invalid");
}

const actor: UserActor = {
  type: "user",
  userId: parsedActorUserId.value,
  workosUserId: "user_01",
  sessionId: "session_01",
};

function fakeClient(whoami: () => Promise<unknown>) {
  return {
    api: { whoami } as unknown as BffApiClient,
    actor,
  } as Awaited<ReturnType<typeof resolveMock.resolveAuthenticatedApiClient>>;
}

describe("loadWhoamiProof", () => {
  it("returns unauthenticated when the browser session does not resolve", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(null);

    await expect(loadWhoamiProof()).resolves.toEqual({ kind: "unauthenticated" });
  });

  it("returns the metadata proof for a valid API envelope", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(
      fakeClient(() =>
        Promise.resolve({
          ok: true,
          data: {
            actorType: "user",
            userId: actor.userId,
            sessionId: actor.sessionId,
          },
        }),
      ),
    );

    await expect(loadWhoamiProof()).resolves.toEqual({
      kind: "authenticated",
      actorType: "user",
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
  });

  it("returns unavailable when a non-JSON response rejects during parsing", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(
      fakeClient(() => {
        JSON.parse("Internal Server Error");
        return Promise.resolve(null);
      }),
    );

    await expect(loadWhoamiProof()).resolves.toEqual({ kind: "unavailable" });
  });

  it("returns unavailable for a malformed API envelope", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(
      fakeClient(() => Promise.resolve({ ok: false, error: { code: "store.unavailable" } })),
    );

    await expect(loadWhoamiProof()).resolves.toEqual({ kind: "unavailable" });
  });
});
