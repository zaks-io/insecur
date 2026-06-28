import {
  AUTH_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  environmentId,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { PRODUCTION_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import { recordAccessDeniedAudit } from "../src/record-access-audit.js";
import {
  recordApprovalAudit,
  recordKeyCustodyAudit,
  recordSyncAudit,
} from "../src/production-audit-writers.js";
import { writeAuditEvent } from "../src/write-audit-event.js";

vi.mock("../src/write-audit-event.js", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  writeAuditEventInTenantScope: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const REQUEST = requestId.brand("req_00000000000000000000000001");
const OPERATION = operationId.brand("op_00000000000000000000000001");

const writeMock = vi.mocked(writeAuditEvent);

describe("production audit helpers", () => {
  it("recordSyncAudit writes execution denied with operation correlation", async () => {
    writeMock.mockClear();

    await recordSyncAudit({
      phase: "execution",
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      requestId: REQUEST,
      operationId: OPERATION,
      reasonCode: "sync.provider_drift",
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionDenied,
        outcome: "denied",
        denial: { reasonCode: "sync.provider_drift" },
        request: { requestId: REQUEST },
        operation: { operationId: OPERATION },
      }),
    );
  });

  it("recordKeyCustodyAudit writes data key readiness success", async () => {
    writeMock.mockClear();

    await recordKeyCustodyAudit({
      action: "data_key_ready",
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.cryptoDataKeyReady,
        outcome: "success",
      }),
    );
  });

  it("recordApprovalAudit writes request rejection with tenant scope", async () => {
    writeMock.mockClear();

    await recordApprovalAudit({
      action: "request_rejected",
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.approvalRequestRejected,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    );
  });

  it("recordSyncAudit writes denied with default reason when reasonCode is omitted", async () => {
    writeMock.mockClear();

    await recordSyncAudit({
      phase: "execution",
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        denial: { reasonCode: "audit.event_invalid" },
      }),
    );
  });

  it("recordAccessDeniedAudit always supplies a denial reason", async () => {
    writeMock.mockClear();

    await recordAccessDeniedAudit({
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "access.denied",
        denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope },
      }),
    );
  });

  it("recordKeyCustodyAudit writes denied rotation with stable crypto codes", async () => {
    writeMock.mockClear();

    await recordKeyCustodyAudit({
      action: "key_rotation_planned",
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      reasonCode: CRYPTO_ERROR_CODES.rootKeyNotConfigured,
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.cryptoKeyRotationDenied,
        denial: { reasonCode: CRYPTO_ERROR_CODES.rootKeyNotConfigured },
      }),
    );
  });
});
