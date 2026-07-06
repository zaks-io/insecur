import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { isConsoleUnavailable } from "./unavailable.js";
import { requireConsoleRead, requireConsoleSession } from "./route-guards.js";
import type { ConsoleRead } from "../server/console-read.js";
import type { ConsoleSession } from "../server/console-session.js";

const MEMBER_ORG = { organizationId: "org_01", displayName: "Acme" };

describe("requireConsoleSession", () => {
  it("redirects unauthenticated visitors to login", () => {
    const session: ConsoleSession = { kind: "unauthenticated" };
    try {
      requireConsoleSession(session, "/orgs");
      expect.unreachable("expected redirect");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
    }
  });

  it("throws the outage sentinel for a resolved session with an API outage", () => {
    const session: ConsoleSession = { kind: "unavailable" };
    try {
      requireConsoleSession(session, "/orgs");
      expect.unreachable("expected outage sentinel");
    } catch (error) {
      expect(isConsoleUnavailable(error)).toBe(true);
    }
  });

  it("returns authenticated session data when the read succeeds", () => {
    const session: ConsoleSession = {
      kind: "authenticated",
      organizations: [MEMBER_ORG],
    };
    expect(requireConsoleSession(session, "/orgs")).toEqual(session);
  });
});

describe("requireConsoleRead", () => {
  it("redirects unauthenticated visitors to login", () => {
    const read: ConsoleRead<{ projects: [] }> = { kind: "unauthenticated" };
    try {
      requireConsoleRead(read, "/orgs/org_01/projects");
      expect.unreachable("expected redirect");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
    }
  });

  it("throws the outage sentinel when the API hop fails after session resolution", () => {
    const read: ConsoleRead<{ projects: [] }> = { kind: "unavailable" };
    try {
      requireConsoleRead(read, "/orgs/org_01/projects");
      expect.unreachable("expected outage sentinel");
    } catch (error) {
      expect(isConsoleUnavailable(error)).toBe(true);
    }
  });

  it("returns ok values", () => {
    const read: ConsoleRead<{ projects: [] }> = { kind: "ok", value: { projects: [] } };
    expect(requireConsoleRead(read, "/orgs/org_01/projects")).toEqual({ projects: [] });
  });
});
