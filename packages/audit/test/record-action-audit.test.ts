import {
  AUDIT_ERROR_CODES,
  environmentId,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import { recordActionAudit } from "../src/record-action-audit.js";
import { writeAuditEvent } from "../src/write-audit-event.js";

vi.mock("../src/write-audit-event.js", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const REQUEST = { requestId: requestId.brand("req_00000000000000000000000001") };
const OPERATION = { operationId: operationId.brand("op_00000000000000000000000001") };
const RESOURCE = {
  type: "secret" as const,
  id: "sec_00000000000000000000000001" as const,
};
const RELATED = {
  type: "secret_version" as const,
  id: "sv_00000000000000000000000001" as const,
};

const writeMock = vi.mocked(writeAuditEvent);

describe("recordActionAudit", () => {
  it("records success with optional scope and resource fields", async () => {
    writeMock.mockClear();

    const result = await recordActionAudit({
      outcome: "success",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      resource: RESOURCE,
      relatedResource: RELATED,
      request: REQUEST,
      operation: OPERATION,
    });

    expect(result).toEqual({ auditEventId: "aud_test" });
    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock).toHaveBeenCalledWith({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      resource: RESOURCE,
      relatedResource: RELATED,
      request: REQUEST,
      operation: OPERATION,
    });
  });

  it("records denied with reasonCode and denial metadata", async () => {
    writeMock.mockClear();

    const result = await recordActionAudit({
      outcome: "denied",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      reasonCode: AUDIT_ERROR_CODES.eventInvalid,
    });

    expect(result).toEqual({ auditEventId: "aud_test" });
    expect(writeMock).toHaveBeenCalledWith({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      denial: { reasonCode: AUDIT_ERROR_CODES.eventInvalid },
    });
  });

  it("returns undefined for denied without reasonCode", async () => {
    writeMock.mockClear();

    const result = await recordActionAudit({
      outcome: "denied",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
    });

    expect(result).toBeUndefined();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("omits optional resource and relatedResource when absent", async () => {
    writeMock.mockClear();

    await recordActionAudit({
      outcome: "success",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
    });

    const event = writeMock.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("resource");
    expect(event).not.toHaveProperty("relatedResource");
    expect(event).not.toHaveProperty("projectId");
    expect(event).not.toHaveProperty("environmentId");
    expect(event).not.toHaveProperty("request");
    expect(event).not.toHaveProperty("operation");
  });
});
