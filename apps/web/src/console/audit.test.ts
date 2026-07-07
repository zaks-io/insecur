import { describe, expect, it } from "vitest";
import { formatAuditActorPrincipalChain } from "./audit-actor.js";
import type { ConsoleAuditEvent } from "./audit.js";
import {
  auditSearchToApiFilters,
  buildAuditSearchQuery,
  datetimeLocalInputToIso,
  isoToDatetimeLocalInput,
  parseAuditSearch,
} from "./audit-search.js";
import { parseAuditEventsBody } from "./audit.js";

const BASE_EVENT: ConsoleAuditEvent = {
  auditEventId: "aud_00000000000000000000000011",
  eventCode: "secret.non_protected_write",
  outcome: "success",
  resultCode: "audit.succeeded",
  actor: { actorType: "user", userId: "usr_00000000000000000000000011" },
  projectId: null,
  environmentId: null,
  resource: null,
  relatedResource: null,
  requestId: null,
  operationId: null,
  details: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

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

describe("parseAuditEventsBody", () => {
  it("parses metadata-only audit pages", () => {
    const body = {
      ok: true,
      data: {
        events: [BASE_EVENT],
        nextCursor: "cursor_next",
      },
    };

    expect(parseAuditEventsBody(body)).toEqual({
      events: [BASE_EVENT],
      nextCursor: "cursor_next",
    });
  });

  it("fails closed on malformed envelopes", () => {
    expect(
      parseAuditEventsBody({ ok: false, error: { code: "auth.insufficient_scope" } }),
    ).toBeNull();
  });
});

describe("formatAuditActorPrincipalChain", () => {
  it("renders agent session principal chains", () => {
    expect(
      formatAuditActorPrincipalChain({
        ...BASE_EVENT,
        details: {
          agentSessionId: "ags_00000000000000000000000011",
          harnessName: "agent.harness.claude_code",
        },
      }),
    ).toBe(
      "agent ags_00000000000000000000000011 (claude_code) · under usr_00000000000000000000000011",
    );
  });

  it("renders unverified attribution tags", () => {
    expect(
      formatAuditActorPrincipalChain({
        ...BASE_EVENT,
        details: { agentAttributionTag: "claude-code" },
      }),
    ).toBe("usr_00000000000000000000000011 · via claude-code (unverified)");
  });
});
