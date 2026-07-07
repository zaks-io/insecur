import { auditEventId, VALIDATION_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  AUDIT_EVENTS_DEFAULT_PAGE_SIZE,
  AUDIT_EVENTS_MAX_PAGE_SIZE,
  queryTenantAuditEventsInTenantScope,
} from "../src/query-tenant-audit-events.js";

describe("queryTenantAuditEvents validation", () => {
  it("rejects malformed cursors", async () => {
    await expect(
      queryTenantAuditEventsInTenantScope({} as never, {
        organizationId: "org_00000000000000000000000001" as never,
        cursor: "not-a-cursor",
      }),
    ).rejects.toMatchObject({ code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId });
  });

  it("rejects invalid page sizes", async () => {
    await expect(
      queryTenantAuditEventsInTenantScope({} as never, {
        organizationId: "org_00000000000000000000000001" as never,
        pageSize: AUDIT_EVENTS_MAX_PAGE_SIZE + 1,
      }),
    ).rejects.toMatchObject({ code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId });

    await expect(
      queryTenantAuditEventsInTenantScope({} as never, {
        organizationId: "org_00000000000000000000000001" as never,
        pageSize: 0,
      }),
    ).rejects.toMatchObject({ code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId });
  });

  it("defaults page size when omitted", async () => {
    let capturedLimit: number | undefined;
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]): Promise<never[]> => {
      if (strings.join("").includes("LIMIT")) {
        capturedLimit = values.at(-1) as number;
      }
      return [];
    }) as never;

    await queryTenantAuditEventsInTenantScope(sql, {
      organizationId: "org_00000000000000000000000001" as never,
    });

    expect(capturedLimit).toBe(AUDIT_EVENTS_DEFAULT_PAGE_SIZE + 1);
  });

  it("accepts a valid encoded cursor before querying", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-07-01T12:00:00.000Z",
        id: auditEventId.brand("aud_00000000000000000000000001"),
      }),
    ).toString("base64url");

    let queried = false;
    const sql = (async (): Promise<never[]> => {
      queried = true;
      return [];
    }) as never;

    await queryTenantAuditEventsInTenantScope(sql, {
      organizationId: "org_00000000000000000000000001" as never,
      cursor,
    });

    expect(queried).toBe(true);
  });
});
