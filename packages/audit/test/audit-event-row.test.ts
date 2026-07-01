import {
  AUDIT_SUCCESS_RESULT_CODE,
  environmentId,
  machineIdentityId,
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
      actorMachineIdentityId: null,
      projectId: PROJECT,
      environmentId: ENV,
      resourceType: "secret",
      resourceId: "sec_00000000000000000000000001",
      relatedResourceType: null,
      relatedResourceId: null,
      requestId: REQUEST,
      operationId: OPERATION,
      details: null,
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
    expect(row.details).toBeNull();
  });

  it("maps metadata-safe details onto the insert row", () => {
    const auditEventId = generateAuditEventId();

    const row = toAuditEventInsertRow(
      {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        denial: { reasonCode: "auth.insufficient_scope" },
        details: { gate: "audit.gate.storage_security", retryable: false },
      },
      auditEventId,
      "auth.insufficient_scope",
    );

    expect(row.details).toEqual({ gate: "audit.gate.storage_security", retryable: false });
  });

  it("maps machine and ci_exchange actors onto insert rows", () => {
    const auditEventId = generateAuditEventId();
    const machine = machineIdentityId.brand("mach_00000000000000000000000001");

    const machineRow = toAuditEventInsertRow(
      {
        eventCode: "machine_auth.github_actions_oidc_exchanged",
        outcome: "success",
        actor: { type: "machine", machineIdentityId: machine },
        organizationId: ORG,
      },
      auditEventId,
      AUDIT_SUCCESS_RESULT_CODE,
    );

    expect(machineRow.actorType).toBe("machine");
    expect(machineRow.actorUserId).toBeNull();
    expect(machineRow.actorMachineIdentityId).toBe(machine);

    const ciRow = toAuditEventInsertRow(
      {
        eventCode: "machine_auth.github_actions_oidc_exchange_denied",
        outcome: "denied",
        actor: { type: "ci_exchange" },
        organizationId: ORG,
        denial: { reasonCode: "auth.oidc_wrong_audience" },
      },
      auditEventId,
      "auth.oidc_wrong_audience",
    );

    expect(ciRow.actorType).toBe("ci_exchange");
    expect(ciRow.actorUserId).toBeNull();
    expect(ciRow.actorMachineIdentityId).toBeNull();
  });
});
