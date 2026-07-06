import { describe, expect, it, vi } from "vitest";
import type { BffApiClient } from "./bff-api.js";
import { consoleRead } from "./console-read.js";

const resolveMock = vi.hoisted(() => ({ resolveAuthenticatedApiClient: vi.fn() }));

vi.mock("./bff-api.js", () => resolveMock);

// A resolved client whose `api` the read closure never actually calls in these tests: the read is
// the fake, so the api surface is irrelevant. Cast keeps the seam honest without a full stub.
const FAKE_CLIENT = { api: {} as BffApiClient, actor: {} } as Awaited<
  ReturnType<typeof resolveMock.resolveAuthenticatedApiClient>
>;

describe("consoleRead fail-closed contract", () => {
  it("maps an unresolved session to unauthenticated without calling the read", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(null);
    const read = vi.fn();

    const result = await consoleRead(read);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(read).not.toHaveBeenCalled();
  });

  it("maps a null value to a metadata-safe denial", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => null);

    expect(result).toEqual({ kind: "denied" });
  });

  it("carries a non-null value through as ok", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => ({ projects: [] }));

    expect(result).toEqual({ kind: "ok", value: { projects: [] } });
  });

  it("maps a transport rejection to unavailable instead of throwing a loader error", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => {
      throw new TypeError("network error: fetch failed");
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("maps a JSON-parse rejection (non-JSON 5xx body) to unavailable, never a 500", async () => {
    resolveMock.resolveAuthenticatedApiClient.mockResolvedValueOnce(FAKE_CLIENT);

    const result = await consoleRead(async () => {
      // Stand-in for `await response.json()` throwing on an HTML 5xx error page.
      JSON.parse("<html>502 Bad Gateway</html>");
      return { unreached: true };
    });

    expect(result).toEqual({ kind: "unavailable" });
  });
});
