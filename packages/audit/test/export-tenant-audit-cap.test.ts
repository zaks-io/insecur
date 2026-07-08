import { AUDIT_ERROR_CODES, organizationId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  AUDIT_EXPORT_MAX_ENTRY_COUNT,
  AuditExportEntryLimitExceededError,
  listAuditExportEventsInTenantScope,
} from "../src/index.js";

function auditEventRow(index: number) {
  return {
    id: `evt_${String(index).padStart(26, "0")}`,
    org_id: "org_00000000000000000000000001",
    event_code: "onboarding.guided_provisioned",
    outcome: "success",
    result_code: "success",
    actor_type: "user",
    actor_user_id: "usr_00000000000000000000000001",
    actor_machine_identity_id: null,
    project_id: null,
    environment_id: null,
    resource_type: null,
    resource_id: null,
    related_resource_type: null,
    related_resource_id: null,
    request_id: null,
    operation_id: null,
    details: null,
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

describe("audit export entry cap", () => {
  it("exposes a stable error code and cap constant", () => {
    const error = new AuditExportEntryLimitExceededError(AUDIT_EXPORT_MAX_ENTRY_COUNT);
    expect(error.code).toBe(AUDIT_ERROR_CODES.exportEntryLimitExceeded);
    expect(error.maxEntryCount).toBe(AUDIT_EXPORT_MAX_ENTRY_COUNT);
    expect(error.message).toContain(String(AUDIT_EXPORT_MAX_ENTRY_COUNT));
  });

  it("queries with a limit of max+1", async () => {
    let capturedLimit: number | undefined;
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes("LIMIT")) {
        capturedLimit = values.at(-1) as number;
      }
      return [];
    }) as never;

    await listAuditExportEventsInTenantScope(sql, {
      organizationId: organizationId.brand("org_00000000000000000000000001"),
      timeRange: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-02T00:00:00.000Z",
      },
    });

    expect(capturedLimit).toBe(AUDIT_EXPORT_MAX_ENTRY_COUNT + 1);
  });

  it("rejects exports above the cap", async () => {
    const sql = (async (): Promise<ReturnType<typeof auditEventRow>[]> =>
      Array.from({ length: AUDIT_EXPORT_MAX_ENTRY_COUNT + 1 }, (_, index) =>
        auditEventRow(index),
      )) as never;

    await expect(
      listAuditExportEventsInTenantScope(sql, {
        organizationId: organizationId.brand("org_00000000000000000000000001"),
        timeRange: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-02T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({
      code: AUDIT_ERROR_CODES.exportEntryLimitExceeded,
      maxEntryCount: AUDIT_EXPORT_MAX_ENTRY_COUNT,
    });
  });
});
