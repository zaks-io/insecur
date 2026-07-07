import { describe, expect, it, vi } from "vitest";
import { WORKOS_SESSION_COOKIE } from "@insecur/auth";

const workosMock = vi.hoisted(() => ({
  authenticateWorkOSSession: vi.fn(),
  createWorkOSSessionPortFromEnv: vi.fn(),
}));

vi.mock("../auth/workos-port.js", () => ({
  createWorkOSSessionPortFromEnv: workosMock.createWorkOSSessionPortFromEnv,
}));

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
      authenticateSealedSession: () => Promise.reject(new Error("WorkOS unavailable")),
    });

    await expect(loadApprovalPasskeyPosture()).resolves.toEqual({ kind: "unauthenticated" });
  });
});
