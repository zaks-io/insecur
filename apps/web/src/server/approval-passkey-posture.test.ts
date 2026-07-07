import { describe, expect, it, vi } from "vitest";
import { WORKOS_SESSION_COOKIE } from "@insecur/auth";

const workosMock = vi.hoisted(() => ({
  authenticateWorkOSSession: vi.fn(),
  createWorkOSSessionPortFromEnv: vi.fn(),
}));

vi.mock("../auth/workos-port.js", () => ({
  createWorkOSSessionPortFromEnv: workosMock.createWorkOSSessionPortFromEnv,
}));

vi.mock("@insecur/auth", async () => {
  const actual = await vi.importActual<typeof import("@insecur/auth")>("@insecur/auth");
  return {
    ...actual,
    authenticateWorkOSSession: workosMock.authenticateWorkOSSession,
  };
});

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://insecur.test/orgs/org_01", {
      headers: { Cookie: `${WORKOS_SESSION_COOKIE}=sealed-session` },
    }),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (fn: (opts?: unknown) => unknown) => fn,
    };
    return builder;
  },
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

const { loadApprovalPasskeyPosture } = await import("./approval-passkey-posture.js");

describe("loadApprovalPasskeyPosture fail-closed contract", () => {
  it("returns unauthenticated when WorkOS session lookup throws", async () => {
    workosMock.createWorkOSSessionPortFromEnv.mockReturnValue({
      userHasRegisteredPasskey: () => Promise.reject(new Error("WorkOS unavailable")),
    });
    workosMock.authenticateWorkOSSession.mockRejectedValue(new Error("WorkOS unavailable"));

    await expect(loadApprovalPasskeyPosture()).resolves.toEqual({ kind: "unauthenticated" });
  });

  it("returns unauthenticated when passkey metadata lookup throws", async () => {
    workosMock.createWorkOSSessionPortFromEnv.mockReturnValue({
      userHasRegisteredPasskey: () => Promise.reject(new Error("WorkOS unavailable")),
    });
    workosMock.authenticateWorkOSSession.mockResolvedValue({
      ok: true,
      context: {
        user: { id: "user_01workos" },
        sessionId: "session_password",
        authFactors: [{ type: "totp" }],
        authenticationMethod: "Password",
      },
    });

    await expect(loadApprovalPasskeyPosture()).resolves.toEqual({ kind: "unauthenticated" });
  });

  it("accepts password sessions when AuthKit enrollment metadata is present", async () => {
    workosMock.createWorkOSSessionPortFromEnv.mockReturnValue({
      userHasRegisteredPasskey: () => Promise.resolve(true),
    });
    workosMock.authenticateWorkOSSession.mockResolvedValue({
      ok: true,
      context: {
        user: { id: "user_01workos" },
        sessionId: "session_password",
        authFactors: [{ type: "totp" }],
        authenticationMethod: "Password",
      },
    });

    await expect(loadApprovalPasskeyPosture()).resolves.toEqual({
      kind: "authenticated",
      enrolled: true,
    });
  });
});
