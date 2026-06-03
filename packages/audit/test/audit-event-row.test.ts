import {
  AUDIT_SUCCESS_RESULT_CODE,
  environmentId,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import { toAuditEventInsertRow } from "../src/audit-event-row.js";
import { generateAuditEventId } from "../src/generate-audit-event-id.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const REQUEST = requestId.brand("req_00000000000000000000000001");
const OPERATION = operationId.brand("op_00000000000000000000000001");

describe("toAuditEventInsertRow", () => {
  it("maps tenant scope, correlation, and success result metadata", () => {
    const auditEventId = generateAuditEventId();

    const row = toAuditEventInsertRow(
      {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        resource: { type: "secret", id: "sec_00000000000000000000000001" },
        request: { requestId: REQUEST },
        operation: { operationId: OPERATION },
      },
      auditEventId,
      AUDIT_SUCCESS_RESULT_CODE,
    );

    expect(row).toEqual({
      id: auditEventId,
      orgId: ORG,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      outcome: "success",
      resultCode: AUDIT_SUCCESS_RESULT_CODE,
      actorType: "user",
      actorUserId: USER,
      projectId: PROJECT,
      environmentId: ENV,
      resourceType: "secret",
      resourceId: "sec_00000000000000000000000001",
      relatedResourceType: null,
      relatedResourceId: null,
      requestId: REQUEST,
      operationId: OPERATION,
    });
  });

  it("maps denied outcomes to stable denial result codes", () => {
    const auditEventId = generateAuditEventId();

    const row = toAuditEventInsertRow(
      {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        denial: { reasonCode: "auth.insufficient_scope" },
      },
      auditEventId,
      "auth.insufficient_scope",
    );

    expect(row.outcome).toBe("denied");
    expect(row.resultCode).toBe("auth.insufficient_scope");
    expect(row.projectId).toBeNull();
    expect(row.environmentId).toBeNull();
    expect(row.requestId).toBeNull();
    expect(row.operationId).toBeNull();
  });
});
