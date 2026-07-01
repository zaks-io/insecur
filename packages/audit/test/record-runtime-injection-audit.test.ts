import {
  AUDIT_ERROR_CODES,
  brandValue,
  environmentId,
  INJECTION_ERROR_CODES,
  injectionGrantId,
  operationId,
  organizationId,
  projectId,
  requestId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import {
  recordRuntimeInjectionAudit,
  recordRuntimeInjectionAuditInTenantScope,
  type RuntimeInjectionAuditPhase,
} from "../src/record-runtime-injection-audit.js";
import { writeAuditEvent, writeAuditEventInTenantScope } from "../src/write-audit-event.js";

vi.mock("../src/write-audit-event.js", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  writeAuditEventInTenantScope: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const REQUEST = { requestId: requestId.brand("req_00000000000000000000000001") };
const OPERATION = { operationId: operationId.brand("op_00000000000000000000000001") };

const writeMock = vi.mocked(writeAuditEvent);
const writeInScopeMock = vi.mocked(writeAuditEventInTenantScope);

const PHASE_OUTCOME_EVENT_CODES = [
  {
    phase: "issue" as const,
    outcome: "success" as const,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued,
  },
  {
    phase: "issue" as const,
    outcome: "denied" as const,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied,
  },
  {
    phase: "consume" as const,
    outcome: "success" as const,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
  },
  {
    phase: "consume" as const,
    outcome: "denied" as const,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
  },
  {
    phase: "run" as const,
    outcome: "success" as const,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
  },
  {
    phase: "run" as const,
    outcome: "denied" as const,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunDenied,
  },
] as const;

function baseInput(phase: RuntimeInjectionAuditPhase, outcome: "success" | "denied") {
  return {
    phase,
    outcome,
    actor: { type: "user" as const, userId: USER },
    organizationId: ORG,
  };
}

describe("recordRuntimeInjectionAudit", () => {
  it("records childExitCode in run audit details", async () => {
    await recordRuntimeInjectionAudit({
      phase: "run",
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      grantId: GRANT,
      childExitCode: 17,
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
        details: { childExitCode: 17 },
      }),
    );
  });

  it.each(PHASE_OUTCOME_EVENT_CODES)(
    "maps $phase $outcome to $eventCode",
    async ({ phase, outcome, eventCode }) => {
      writeMock.mockClear();

      const result = await recordRuntimeInjectionAudit(baseInput(phase, outcome));

      expect(result).toEqual({ auditEventId: "aud_test" });
      expect(writeMock).toHaveBeenCalledOnce();
      expect(writeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventCode,
          outcome,
          actor: { type: "user", userId: USER },
          organizationId: ORG,
        }),
      );
    },
  );

  it("records success with grant resource, delivered secret version, and scope metadata", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit({
      ...baseInput("consume", "success"),
      projectId: PROJECT,
      environmentId: ENV,
      grantId: GRANT,
      deliveredSecretVersionId: VERSION,
      request: REQUEST,
      operation: OPERATION,
    });

    expect(writeMock).toHaveBeenCalledWith({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      resource: { type: "injection_grant", id: GRANT },
      relatedResource: { type: "secret_version", id: VERSION },
      request: REQUEST,
      operation: OPERATION,
    });
  });

  it("records denied with reasonCode", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit({
      ...baseInput("issue", "denied"),
      reasonCode: INJECTION_ERROR_CODES.grantDenied,
    });

    expect(writeMock).toHaveBeenCalledWith({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied,
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      denial: { reasonCode: INJECTION_ERROR_CODES.grantDenied },
    });
  });

  it("records denied with audit.event_invalid when reasonCode is omitted", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit(baseInput("run", "denied"));

    expect(writeMock).toHaveBeenCalledWith({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunDenied,
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      denial: { reasonCode: AUDIT_ERROR_CODES.eventInvalid },
    });
  });

  it("omits optional scope, resource, and correlation fields when absent", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit(baseInput("issue", "success"));

    const event = writeMock.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("projectId");
    expect(event).not.toHaveProperty("environmentId");
    expect(event).not.toHaveProperty("resource");
    expect(event).not.toHaveProperty("relatedResource");
    expect(event).not.toHaveProperty("request");
    expect(event).not.toHaveProperty("operation");
  });

  it("omits grant resource when grantId is absent", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit({
      ...baseInput("consume", "success"),
      deliveredSecretVersionId: VERSION,
    });

    const event = writeMock.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("resource");
    expect(event).toMatchObject({
      relatedResource: { type: "secret_version", id: VERSION },
    });
  });

  it("omits delivered secret version related resource when absent", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit({
      ...baseInput("consume", "success"),
      grantId: GRANT,
    });

    const event = writeMock.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).toMatchObject({
      resource: { type: "injection_grant", id: GRANT },
    });
    expect(event).not.toHaveProperty("relatedResource");
  });

  it("omits grant resource when grantId is malformed", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit({
      ...baseInput("issue", "success"),
      grantId: brandValue<string, "InjectionGrantId">("igr_not-a-valid-grant-id"),
    });

    const event = writeMock.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("resource");
  });

  it("omits secret version related resource when deliveredSecretVersionId is malformed", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit({
      ...baseInput("run", "success"),
      deliveredSecretVersionId: brandValue<string, "SecretVersionId">("sv_not-a-valid-version-id"),
    });

    const event = writeMock.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("relatedResource");
  });

  it("omits grant resource when grantId has the wrong prefix", async () => {
    writeMock.mockClear();

    await recordRuntimeInjectionAudit({
      ...baseInput("issue", "success"),
      grantId: brandValue<string, "InjectionGrantId">("org_00000000000000000000000001"),
    });

    const event = writeMock.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("resource");
  });

  it("records on an existing tenant-scoped transaction", async () => {
    writeInScopeMock.mockClear();
    const sql = {} as never;

    const result = await recordRuntimeInjectionAuditInTenantScope(sql, {
      ...baseInput("consume", "success"),
      grantId: GRANT,
      projectId: PROJECT,
      request: REQUEST,
    });

    expect(result).toEqual({ auditEventId: "aud_test" });
    expect(writeInScopeMock).toHaveBeenCalledWith(sql, {
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      resource: { type: "injection_grant", id: GRANT },
      request: REQUEST,
    });
  });
});
