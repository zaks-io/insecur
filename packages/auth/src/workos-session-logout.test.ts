import { describe, expect, it, vi } from "vitest";
import type { WorkOS } from "@workos-inc/node";
import { getSessionLogoutUrlWithWorkOS } from "./workos-session-logout.js";
import type { WorkOSAuthConfig } from "./workos-config.js";

const config = {
  clientId: "client_123",
  apiKey: "sk_test",
  cookiePassword: "a".repeat(32),
} as unknown as WorkOSAuthConfig;

function fakeWorkOS(session: {
  authenticate: () => Promise<unknown>;
  refresh?: () => Promise<unknown>;
}): {
  workos: WorkOS;
  getLogoutUrl: ReturnType<typeof vi.fn>;
  loadSealedSession: ReturnType<typeof vi.fn>;
} {
  const getLogoutUrl = vi.fn(
    ({ sessionId }: { sessionId: string }) => `https://auth.example/logout/${sessionId}`,
  );
  const refresh = vi.fn(session.refresh ?? (() => Promise.reject(new Error("refresh not stubbed"))));
  const loadSealedSession = vi.fn(() => ({
    authenticate: session.authenticate,
    refresh,
  }));
  const workos = {
    userManagement: {
      loadSealedSession,
      getLogoutUrl,
    },
  } as unknown as WorkOS;
  return { workos, getLogoutUrl, loadSealedSession };
}

describe("getSessionLogoutUrlWithWorkOS", () => {
  it("maps an authenticated session straight to its logout URL", async () => {
    const { workos } = fakeWorkOS({
      authenticate: () => Promise.resolve({ authenticated: true, sessionId: "session_live" }),
    });
    await expect(getSessionLogoutUrlWithWorkOS(workos, config, "sealed")).resolves.toBe(
      "https://auth.example/logout/session_live",
    );
  });

  it("refreshes an expired access token so logout still terminates the live provider session", async () => {
    const { workos, getLogoutUrl } = fakeWorkOS({
      authenticate: () => Promise.resolve({ authenticated: false, reason: "invalid_jwt_expired" }),
      refresh: () => Promise.resolve({ authenticated: true, sessionId: "session_refreshed" }),
    });
    await expect(getSessionLogoutUrlWithWorkOS(workos, config, "sealed")).resolves.toBe(
      "https://auth.example/logout/session_refreshed",
    );
    expect(getLogoutUrl).toHaveBeenCalledWith({ sessionId: "session_refreshed" });
  });

  it("returns null when the session neither authenticates nor refreshes", async () => {
    const { workos, getLogoutUrl } = fakeWorkOS({
      authenticate: () =>
        Promise.resolve({ authenticated: false, reason: "invalid_session_cookie" }),
      refresh: () => Promise.resolve({ authenticated: false, reason: "invalid_session_cookie" }),
    });
    await expect(getSessionLogoutUrlWithWorkOS(workos, config, "sealed")).resolves.toBeNull();
    expect(getLogoutUrl).not.toHaveBeenCalled();
  });

  it("unseals the session with the caller's sessionData and the configured cookiePassword", async () => {
    const { workos, loadSealedSession } = fakeWorkOS({
      authenticate: () => Promise.resolve({ authenticated: true, sessionId: "session_live" }),
    });
    await getSessionLogoutUrlWithWorkOS(workos, config, "sealed-cookie-value");
    expect(loadSealedSession).toHaveBeenCalledWith({
      sessionData: "sealed-cookie-value",
      cookiePassword: config.cookiePassword,
    });
  });

  it("never falls back to refresh once authenticate already reports a live session", async () => {
    const refresh = vi.fn(() => Promise.resolve({ authenticated: true, sessionId: "session_refreshed" }));
    const { workos } = fakeWorkOS({
      authenticate: () => Promise.resolve({ authenticated: true, sessionId: "session_live" }),
      refresh,
    });
    await getSessionLogoutUrlWithWorkOS(workos, config, "sealed");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("propagates a refresh failure instead of silently treating it as an unauthenticated result", async () => {
    const { workos } = fakeWorkOS({
      authenticate: () => Promise.resolve({ authenticated: false, reason: "invalid_jwt_expired" }),
      refresh: () => Promise.reject(new Error("workos refresh endpoint unreachable")),
    });
    await expect(getSessionLogoutUrlWithWorkOS(workos, config, "sealed")).rejects.toThrow(
      "workos refresh endpoint unreachable",
    );
  });
});
