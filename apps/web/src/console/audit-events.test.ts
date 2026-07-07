import { describe, expect, it } from "vitest";
import { formatConsoleAuditActorLabel } from "./audit-actor-label.js";
import type { ConsoleAuditEvent } from "./audit-events.js";
import { parseOrgAuditEventsBody } from "./audit-events.js";
import {
  auditSearchToApiFilters,
  buildAuditSearchQuery,
  datetimeLocalInputToIso,
  isoToDatetimeLocalInput,
  parseAuditSearch,
} from "./audit-search.js";

const baseEvent: ConsoleAuditEvent = {
  auditEventId: "aud_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  eventCode: "secret.non_protected_write",
  outcome: "success",
  resultCode: "audit.succeeded",
  actor: { actorType: "user", userId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E" },
  projectId: null,
  environmentId: null,
  resource: null,
  relatedResource: null,
  requestId: null,
  operationId: null,
  details: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

describe("parseOrgAuditEventsBody", () => {
  it("parses the success envelope into metadata-only audit rows", () => {
    const parsed = parseOrgAuditEventsBody({
      ok: true,
      data: {
        events: [baseEvent],
        nextCursor: "cursor_test",
      },
    });
    expect(parsed).toEqual({ events: [baseEvent], nextCursor: "cursor_test" });
  });

  it("parses an empty events list (the Home empty-state path)", () => {
    expect(parseOrgAuditEventsBody({ ok: true, data: { events: [], nextCursor: null } })).toEqual({
      events: [],
      nextCursor: null,
    });
  });

  it("fails closed on error envelopes so denial reads as nonexistence", () => {
    expect(
      parseOrgAuditEventsBody({ ok: false, error: { code: "auth.insufficient_scope" } }),
    ).toBeNull();
    expect(parseOrgAuditEventsBody(undefined)).toBeNull();
    expect(parseOrgAuditEventsBody({ ok: true, data: {} })).toBeNull();
  });

  it("fails closed when any entry is malformed rather than returning a partial list", () => {
    expect(
      parseOrgAuditEventsBody({
        ok: true,
        data: { events: [baseEvent, { auditEventId: 7 }], nextCursor: null },
      }),
    ).toBeNull();
  });
});

describe("parseAuditSearch", () => {
  it("round-trips filter fields through buildAuditSearchQuery", () => {
    const search = parseAuditSearch({
      actorUserId: " usr_01 ",
      projectId: "prj_01",
      eventCode: "secret.non_protected_write",
      createdAtFrom: "2026-07-01T00:00:00.000Z",
      cursor: "cursor_1",
    });

    expect(search).toEqual({
      actorUserId: "usr_01",
      projectId: "prj_01",
      eventCode: "secret.non_protected_write",
      createdAtFrom: "2026-07-01T00:00:00.000Z",
      cursor: "cursor_1",
    });
    expect(buildAuditSearchQuery(search)).toEqual({
      actorUserId: "usr_01",
      projectId: "prj_01",
      eventCode: "secret.non_protected_write",
      createdAtFrom: "2026-07-01T00:00:00.000Z",
      cursor: "cursor_1",
    });
    expect(auditSearchToApiFilters(search)).toEqual({
      actorUserId: "usr_01",
      projectId: "prj_01",
      eventCode: "secret.non_protected_write",
      createdAtFrom: "2026-07-01T00:00:00.000Z",
    });
  });
});

describe("datetime helpers", () => {
  it("converts between ISO and datetime-local input values in UTC", () => {
    const iso = "2026-07-01T12:30:00.000Z";
    expect(isoToDatetimeLocalInput(iso)).toBe("2026-07-01T12:30");
    expect(datetimeLocalInputToIso("2026-07-01T12:30")).toBe(iso);
  });
});

describe("formatConsoleAuditActorLabel", () => {
  it("renders agent-session attribution with harness metadata", () => {
    const label = formatConsoleAuditActorLabel({
      ...baseEvent,
      details: {
        agentSessionId: "ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
        harnessName: "agent.harness.claude_code",
      },
    });
    expect(label).toBe(
      "agent ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E (claude_code) · under usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
    );
  });

  it("renders unverified agent attribution tags on bare human actors", () => {
    const label = formatConsoleAuditActorLabel({
      ...baseEvent,
      details: { agentAttributionTag: "cursor-cloud" },
    });
    expect(label).toBe("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E · via cursor-cloud (unverified)");
  });

  it("renders machine and ci_exchange actors plainly", () => {
    expect(
      formatConsoleAuditActorLabel({
        ...baseEvent,
        actor: { actorType: "machine", machineIdentityId: "mid_01JZ8E2QYQ6M7F4K9A2B3C4D5E" },
      }),
    ).toBe("mid_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
    expect(
      formatConsoleAuditActorLabel({
        ...baseEvent,
        actor: { actorType: "ci_exchange" },
      }),
    ).toBe("ci_exchange");
  });
});
