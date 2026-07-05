import { authFailureForReason, WORKOS_SESSION_COOKIE } from "@insecur/auth";
import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import type { ResolveBrowserActorResult } from "./resolve-browser-actor.js";
import { browserSessionCookieHeadersFromResolveResult } from "./session-headers.js";

const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

describe("browserSessionCookieHeadersFromResolveResult", () => {
  it("returns session clear headers when post-refresh resolution requires clearing", () => {
    const resolved: ResolveBrowserActorResult = {
      ok: false,
      failure: authFailureForReason("not_admitted"),
      clearSession: true,
    };

    const headers = browserSessionCookieHeadersFromResolveResult(resolved);

    expect(headers).toHaveLength(2);
    expect(headers.some((header) => header.includes(`${WORKOS_SESSION_COOKIE}=`))).toBe(true);
    expect(headers.some((header) => header.includes("insecur_csrf="))).toBe(true);
  });

  it("returns no headers for failures that must keep the cookie", () => {
    const resolved: ResolveBrowserActorResult = {
      ok: false,
      failure: authFailureForReason("missing"),
    };

    expect(browserSessionCookieHeadersFromResolveResult(resolved)).toHaveLength(0);
  });

  it("returns rotation headers for successful refresh", () => {
    const resolved: ResolveBrowserActorResult = {
      ok: true,
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId: "user_test",
        sessionId: "session_test",
      },
      rotation: {
        sealedSession: "rotated-session",
        csrfToken: "csrf-token",
      },
    };

    const headers = browserSessionCookieHeadersFromResolveResult(resolved);

    expect(headers).toHaveLength(2);
    expect(headers.some((header) => header.includes("rotated-session"))).toBe(true);
    expect(headers.some((header) => header.includes("csrf-token"))).toBe(true);
  });
});
