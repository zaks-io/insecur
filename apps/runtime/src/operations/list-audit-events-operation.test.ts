import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import { FIRST_VALUE_AUDIT_EVENT_CODES, queryTenantAuditEvents } from "@insecur/audit";
import { auditEventId, organizationId, requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listAuditEventsOperation,
  type ListAuditEventsOperationInput,
} from "./list-audit-events-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    queryTenantAuditEvents: vi.fn(),
  };
});

const organization = organizationId.generate();
const request = requestId.generate();

const auditActor: ListAuditEventsOperationInput["auditActor"] = {
  type: "user",
  userId: userId.generate(),
};
const accessActor: ListAuditEventsOperationInput["accessActor"] = {
  type: "user",
  userId: auditActor.userId,
};

describe("listAuditEventsOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(queryTenantAuditEvents).mockReset();
  });

  it("authorizes metadata:detail_read before querying audit events", async () => {
    const events = [
      {
        auditEventId: auditEventId.brand("aud_00000000000000000000000001"),
        organizationId: organization,
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success" as const,
        resultCode: "audit.succeeded",
        actor: { actorType: "user" as const, userId: auditActor.userId },
        projectId: null,
        environmentId: null,
        resource: null,
        relatedResource: null,
        requestId: null,
        operationId: null,
        details: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    const eventsCopy = [...events];
    const order: string[] = [];

    vi.mocked(authorizeScopeOrThrow).mockImplementation(async () => {
      order.push("authorize");
    });
    vi.mocked(queryTenantAuditEvents).mockImplementation(async () => {
      order.push("read");
      return { events, nextCursor: null };
    });

    const payload = await listAuditEventsOperation({
      input: {
        organizationId: organization,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
        filters: { eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite },
        pageSize: 25,
      },
      auditActor,
      accessActor,
    });

    expect(order).toEqual(["authorize", "read"]);
    expect(authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredScope: AUTHORIZATION_SCOPES.metadataDetailRead,
        coordinate: { organizationId: organization },
      }),
    );
    expect(queryTenantAuditEvents).toHaveBeenCalledWith({
      organizationId: organization,
      filters: { eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite },
      pageSize: 25,
    });
    expect(payload.events).toEqual(eventsCopy);
  });

  it("propagates authorization denials without querying", async () => {
    vi.mocked(authorizeScopeOrThrow).mockRejectedValue(
      Object.assign(new Error("Missing required permission."), {
        code: "auth.insufficient_scope",
      }),
    );

    await expect(
      listAuditEventsOperation({
        input: {
          organizationId: organization,
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor,
        accessActor,
      }),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });

    expect(queryTenantAuditEvents).not.toHaveBeenCalled();
  });
});
