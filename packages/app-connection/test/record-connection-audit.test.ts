import * as audit from "@insecur/audit";
import {
  appConnectionId,
  brandOpaqueResourceIdForPrefix,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recordConnectionValidated } from "../src/record-connection-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");

describe("recordConnectionValidated audit details", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes metadata-safe validation audit details with stable token status codes", async () => {
    const writeSpy = vi.spyOn(audit, "writeAuditEvent").mockResolvedValue(undefined);

    await recordConnectionValidated({
      actorUserId: USER,
      organizationId: ORG,
      projectId: PROJECT,
      appConnectionId: CONN,
      validation: {
        tokenStatus: "active",
        providerAccountId: "cf-account-123",
        workerScriptReachable: true,
        hasBoundaryWarning: false,
      },
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.connectionValidated,
        outcome: "success",
        details: {
          tokenStatus: "connection.token_status.active",
          workerScriptReachable: true,
          hasBoundaryWarning: false,
        },
      }),
    );
  });

  it("rejects free-form token status strings in validation audit details", () => {
    expect(() => {
      audit.validateAuditEventInput({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.connectionValidated,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        resource: {
          type: "app_connection",
          id: brandOpaqueResourceIdForPrefix("conn", CONN),
        },
        details: {
          tokenStatus: "active",
          workerScriptReachable: true,
          hasBoundaryWarning: false,
        },
      });
    }).toThrow(/stable dotted code or opaque resource ID/);
  });
});
