import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import {
  auditSearchToApiFilters,
  buildAuditSearchQuery,
  parseAuditSearch,
} from "../src/console/audit-search.js";
import { parseOrgAuditEventsBody } from "../src/console/audit-events.js";
import {
  FAKE_ADMITTED_USER_ID,
  FAKE_SEALED_SESSION,
  FAKE_WORKOS_USER_ID,
} from "./support/fake-browser-session.js";
import {
  createFakeApiBinding,
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
} from "./support/fake-web-env.js";
import { ssrRequest } from "./support/ssr-request.js";

// Audit section read over the INS-376 harness: session cookie -> Runtime admission ->
// scoped-token API hop -> audit-events parse, exactly the seam the /orgs/$orgId/audit loader
// composes through loadOrgAuditEvents.
vi.mock("../src/auth/workos-port.js", async () => {
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  const { fakeSessionEntry } = await import("./support/fake-browser-session.js");
  return {
    createWorkOSSessionPortFromEnv: () => createFakeWorkOSSessionPort([fakeSessionEntry()]),
  };
});
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: () => undefined,
}));

const ORG_ID = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const AUDIT_PATH = `/orgs/${ORG_ID}/audit`;

const AUDIT_EVENT = {
  auditEventId: "aud_00000000000000000000000011",
  organizationId: ORG_ID,
  eventCode: "secret.non_protected_write",
  outcome: "success" as const,
  resultCode: "audit.succeeded",
  actor: {
    actorType: "user" as const,
    userId: "usr_00000000000000000000000011",
  },
  projectId: "prj_00000000000000000000000011",
  environmentId: "env_00000000000000000000000001",
  resource: null,
  relatedResource: null,
  requestId: null,
  operationId: null,
  details: {
    agentSessionId: "ags_00000000000000000000000011",
    harnessName: "agent.harness.claude_code",
  },
  createdAt: "2026-07-01T00:00:00.000Z",
};

const CONSOLE_AUDIT_EVENT = {
  auditEventId: AUDIT_EVENT.auditEventId,
  eventCode: AUDIT_EVENT.eventCode,
  outcome: AUDIT_EVENT.outcome,
  resultCode: AUDIT_EVENT.resultCode,
  actor: AUDIT_EVENT.actor,
  projectId: AUDIT_EVENT.projectId,
  environmentId: AUDIT_EVENT.environmentId,
  resource: AUDIT_EVENT.resource,
  relatedResource: AUDIT_EVENT.relatedResource,
  requestId: AUDIT_EVENT.requestId,
  operationId: AUDIT_EVENT.operationId,
  details: AUDIT_EVENT.details,
  createdAt: AUDIT_EVENT.createdAt,
};

async function authedApiClient(handlers: Parameters<typeof createFakeApiBinding>[0]) {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api, calls } = createFakeApiBinding(handlers);
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

  const resolved = await resolveBrowserActor(
    ssrRequest(AUDIT_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
    env,
  );
  if (!resolved.ok) {
    throw new Error("expected the fake session to resolve");
  }
  return { client: apiClientFor(env, resolved.actor), calls };
}

describe("audit section read over the BFF seam", () => {
  it("forwards filters and pagination to the tenant audit-events route", async () => {
    const search = parseAuditSearch({
      actorUserId: "usr_00000000000000000000000011",
      projectId: "prj_00000000000000000000000011",
      environmentId: "env_00000000000000000000000001",
      eventCode: "secret.non_protected_write",
      createdAtFrom: "2026-07-01T00:00:00.000Z",
      createdAtTo: "2026-07-02T00:00:00.000Z",
      cursor: "cursor_input",
    });
    const filters = auditSearchToApiFilters(search);
    const auditPath = `/v1/orgs/${ORG_ID}/audit-events`;

    const { client, calls } = await authedApiClient({
      [auditPath]: (request) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("actorUserId")).toBe("usr_00000000000000000000000011");
        expect(url.searchParams.get("projectId")).toBe("prj_00000000000000000000000011");
        expect(url.searchParams.get("environmentId")).toBe("env_00000000000000000000000001");
        expect(url.searchParams.get("eventCode")).toBe("secret.non_protected_write");
        expect(url.searchParams.get("createdAtFrom")).toBe("2026-07-01T00:00:00.000Z");
        expect(url.searchParams.get("createdAtTo")).toBe("2026-07-02T00:00:00.000Z");
        expect(url.searchParams.get("cursor")).toBe("cursor_input");
        expect(url.searchParams.get("pageSize")).toBe("25");
        return Response.json({
          ok: true,
          data: { events: [AUDIT_EVENT], nextCursor: "cursor_next" },
        });
      },
    });

    const body = await client.orgAuditEvents(ORG_ID, {
      pageSize: 25,
      ...(search.cursor === undefined ? {} : { cursor: search.cursor }),
      ...(filters === undefined ? {} : { filters }),
    });
    const page = parseOrgAuditEventsBody(body);

    expect(page).toEqual({
      events: [CONSOLE_AUDIT_EVENT],
      nextCursor: "cursor_next",
    });
    const nextSearch = parseAuditSearch({
      ...search,
      ...(page?.nextCursor === null || page?.nextCursor === undefined
        ? {}
        : { cursor: page.nextCursor }),
    });
    expect(buildAuditSearchQuery(nextSearch)).toEqual({
      actorUserId: "usr_00000000000000000000000011",
      projectId: "prj_00000000000000000000000011",
      environmentId: "env_00000000000000000000000001",
      eventCode: "secret.non_protected_write",
      createdAtFrom: "2026-07-01T00:00:00.000Z",
      createdAtTo: "2026-07-02T00:00:00.000Z",
      cursor: "cursor_next",
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.headers.get("Authorization")).toMatch(/^Bearer /u);
    expect(call?.headers.get("Cookie")).toBeNull();
  });

  it("parses empty audit pages as valid authorized reads", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/audit-events`]: () =>
        Response.json({ ok: true, data: { events: [], nextCursor: null } }),
    });

    expect(parseOrgAuditEventsBody(await client.orgAuditEvents(ORG_ID, { pageSize: 25 }))).toEqual({
      events: [],
      nextCursor: null,
    });
  });

  it("fails closed on a non-member denial", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/audit-events`]: () =>
        Response.json({ ok: false, error: { code: "auth.insufficient_scope" } }, { status: 403 }),
    });

    expect(parseOrgAuditEventsBody(await client.orgAuditEvents(ORG_ID, { pageSize: 25 }))).toBeNull();
  });
});
