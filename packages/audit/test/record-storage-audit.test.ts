import {
  environmentId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
  userId,
  SECRET_ERROR_CODES,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import {
  recordStorageAudit,
  recordStorageAuditInTenantScope,
} from "../src/record-storage-audit.js";
import { writeAuditEvent, writeAuditEventInTenantScope } from "../src/write-audit-event.js";

vi.mock("../src/write-audit-event.js", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  writeAuditEventInTenantScope: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

const writeMock = vi.mocked(writeAuditEvent);
const writeInScopeMock = vi.mocked(writeAuditEventInTenantScope);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

describe("recordStorageAudit", () => {
  it("records success with secret and version resource refs", async () => {
    writeMock.mockClear();

    const result = await recordStorageAudit({
      outcome: "success",
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET,
      secretVersionId: VERSION,
    });

    expect(result).toEqual({ auditEventId: "aud_test" });
    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        organizationId: ORG,
        resource: { type: "secret", id: SECRET },
        relatedResource: { type: "secret_version", id: VERSION },
      }),
    );
  });

  it("records denied with the denied default event code and reason", async () => {
    writeMock.mockClear();

    await recordStorageAudit({
      outcome: "denied",
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      reasonCode: SECRET_ERROR_CODES.invalidEncoding,
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
        outcome: "denied",
        denial: { reasonCode: SECRET_ERROR_CODES.invalidEncoding },
      }),
    );
  });
});

describe("recordStorageAuditInTenantScope", () => {
  it("records on the caller's tenant-scoped transaction handle", async () => {
    writeInScopeMock.mockClear();
    const sql = {} as never;

    const result = await recordStorageAuditInTenantScope(sql, {
      outcome: "success",
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET,
      secretVersionId: VERSION,
    });

    expect(result).toEqual({ auditEventId: "aud_test" });
    expect(writeInScopeMock).toHaveBeenCalledOnce();
    expect(writeInScopeMock).toHaveBeenCalledWith(
      sql,
      expect.objectContaining({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        organizationId: ORG,
        resource: { type: "secret", id: SECRET },
        relatedResource: { type: "secret_version", id: VERSION },
      }),
    );
  });
});
