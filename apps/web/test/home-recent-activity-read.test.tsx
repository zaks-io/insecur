import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { parseOrgAuditEventsBody } from "../src/console/audit-events.js";
import { RecentActivityFeedContent } from "../src/components/recent-activity-feed-content.js";
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

// Home recent-activity read over the INS-369 harness: session cookie -> Runtime admission ->
// scoped-token API hop -> audit-events parse, exactly the seam the /orgs/$orgId Home loader
// composes through loadOrgRecentActivity.
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
const HOME_PATH = `/orgs/${ORG_ID}`;

const AUDIT_EVENT = {
  auditEventId: "aud_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  organizationId: ORG_ID,
  eventCode: "secret.non_protected_write",
  outcome: "success",
  resultCode: "audit.succeeded",
  actor: {
    actorType: "user" as const,
    userId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  },
  projectId: null,
  environmentId: null,
  resource: null,
  relatedResource: null,
  requestId: null,
  operationId: null,
  details: {
    agentSessionId: "ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
    harnessName: "agent.harness.claude_code",
  },
  createdAt: "2026-07-01T00:00:00.000Z",
};

async function authedApiClient(handlers: Parameters<typeof createFakeApiBinding>[0]) {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api, calls } = createFakeApiBinding(handlers);
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

  const resolved = await resolveBrowserActor(
    ssrRequest(HOME_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
    env,
  );
  if (!resolved.ok) {
    throw new Error("expected the fake session to resolve");
  }
  return { client: apiClientFor(env, resolved.actor), calls };
}

describe("home recent-activity read over the BFF seam", () => {
  it("reads recent audit metadata for an authorized member", async () => {
    const { client, calls } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/audit-events`]: (request) => {
        expect(new URL(request.url).searchParams.get("pageSize")).toBe("10");
        return Response.json({
          ok: true,
          data: { events: [AUDIT_EVENT], nextCursor: null },
        });
      },
    });

    const parsed = parseOrgAuditEventsBody(await client.orgAuditEvents(ORG_ID, { pageSize: 10 }));

    expect(parsed?.events).toHaveLength(1);
    expect(parsed?.events[0]).toMatchObject({
      auditEventId: AUDIT_EVENT.auditEventId,
      eventCode: AUDIT_EVENT.eventCode,
      outcome: "success",
      actor: AUDIT_EVENT.actor,
      details: AUDIT_EVENT.details,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("Authorization")).toMatch(/^Bearer /u);
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
  });

  it("fails closed on a non-member denial: the error envelope parses to null, like nonexistence", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/audit-events`]: () =>
        Response.json({ ok: false, error: { code: "auth.insufficient_scope" } }, { status: 403 }),
    });

    expect(
      parseOrgAuditEventsBody(await client.orgAuditEvents(ORG_ID, { pageSize: 10 })),
    ).toBeNull();
  });

  it("parses an empty feed as a valid authorized read (the empty-state render path)", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/audit-events`]: () =>
        Response.json({ ok: true, data: { events: [], nextCursor: null } }),
    });

    expect(parseOrgAuditEventsBody(await client.orgAuditEvents(ORG_ID, { pageSize: 10 }))).toEqual({
      events: [],
      nextCursor: null,
    });
  });
});

describe("RecentActivityFeedContent render", () => {
  it("renders audit rows with attribution metadata and an empty-state invitation", () => {
    const withEvents = renderToStaticMarkup(
      <RecentActivityFeedContent
        orgId={ORG_ID}
        events={[
          {
            auditEventId: AUDIT_EVENT.auditEventId,
            eventCode: AUDIT_EVENT.eventCode,
            outcome: "success",
            resultCode: AUDIT_EVENT.resultCode,
            actor: AUDIT_EVENT.actor,
            projectId: null,
            environmentId: null,
            resource: null,
            relatedResource: null,
            requestId: null,
            operationId: null,
            details: AUDIT_EVENT.details,
            createdAt: AUDIT_EVENT.createdAt,
          },
        ]}
      />,
    );
    expect(withEvents).toContain("secret.non_protected_write");
    expect(withEvents).toContain("claude_code");

    const empty = renderToStaticMarkup(<RecentActivityFeedContent orgId={ORG_ID} events={[]} />);
    expect(empty).toContain("No activity yet");
    expect(empty).toContain("insecur init");
  });
});
