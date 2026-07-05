import { describe, expect, it, vi } from "vitest";
import type { BffApiClient } from "./bff-api.js";

const resolveMock = vi.hoisted(() => ({ resolveAuthenticatedApiClient: vi.fn() }));

vi.mock("./bff-api.js", () => resolveMock);

// Run the server fn's handler body directly. The compiler strips this body from the client bundle,
// and the client-mode callable that `createServerFn().handler()` returns RPCs to the server rather
// than invoking the handler in-process, so neither can be called from a unit test. Stub the factory
// so `.handler(fn)` hands back `fn`, letting the fail-closed guard (INS-412 item 6) run in-process.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (fn: (opts?: unknown) => unknown) => fn,
    };
    return builder;
  },
}));

const { loadConsoleSession } = await import("./console-session.js");

function fakeClient(sessionMemberships: () => Promise<unknown>) {
  return {
    api: { sessionMemberships } as unknown as BffApiClient,
    actor: {},
  } as Awaited<ReturnType<typeof resolveMock.resolveAuthenticatedApiClient>>;
}

const MEMBER_ORG = { organizationId: "org_00000000000000000000000001", displayName: "Acme Corp" };

describe("loadConsoleSession fail-closed contract", () => {
  it("returns unauthenticated when the session does not resolve", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(null);

    await expect(loadConsoleSession()).resolves.toEqual({ authenticated: false });
  });

  it("returns the parsed organizations for a well-formed membership envelope", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(
      fakeClient(() => Promise.resolve({ ok: true, data: { organizations: [MEMBER_ORG] } })),
    );

    await expect(loadConsoleSession()).resolves.toEqual({
      authenticated: true,
      organizations: [MEMBER_ORG],
    });
  });

  it("fails closed to unauthenticated on an unparseable envelope", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(
      fakeClient(() => Promise.resolve({ ok: false, error: { code: "auth.required" } })),
    );

    await expect(loadConsoleSession()).resolves.toEqual({ authenticated: false });
  });

  it("fails closed to unauthenticated when the read rejects, never a 500 loader error", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(
      fakeClient(() => Promise.reject(new TypeError("network error: fetch failed"))),
    );

    await expect(loadConsoleSession()).resolves.toEqual({ authenticated: false });
  });

  it("fails closed when the response body parse throws (non-JSON 5xx), never a 500", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(
      fakeClient(() => {
        // Stand-in for `await response.json()` throwing on an HTML 5xx error page.
        JSON.parse("<html>502 Bad Gateway</html>");
        return Promise.resolve({ ok: true, data: { organizations: [] } });
      }),
    );

    await expect(loadConsoleSession()).resolves.toEqual({ authenticated: false });
  });
});
