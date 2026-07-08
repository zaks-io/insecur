import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { PROTECTED_CHANGE_ERROR_CODES, requestId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auditMocks = vi.hoisted(() => ({
  recordActionAudit: vi.fn(),
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordActionAudit: auditMocks.recordActionAudit,
  };
});

import { recordActionAudit } from "@insecur/audit";
import { recordProtectedChangeAudit } from "../src/record-protected-change-audit.js";
import { PROTECTED_CHANGE_STATE_CODES } from "../src/protected-change-states.js";

const ORG = "org_00000000000000000000000001" as Parameters<
  typeof recordProtectedChangeAudit
>[0]["organizationId"];
const PROJECT = "prj_00000000000000000000000001" as Parameters<
  typeof recordProtectedChangeAudit
>[0]["projectId"];
const ENV = "env_00000000000000000000000001" as Parameters<
  typeof recordProtectedChangeAudit
>[0]["environmentId"];
const PROTECTED_CHANGE_ID = requestId.brand("req_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: "usr_00000000000000000000000001" as never };

const BASE = {
  actor: ACTOR,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  protectedChangeId: PROTECTED_CHANGE_ID,
} as const;

describe("recordProtectedChangeAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMocks.recordActionAudit.mockResolvedValue({ auditEventId: "aud_x" });
  });

  it("records a success event under the action's own production event code", async () => {
    await recordProtectedChangeAudit({
      ...BASE,
      action: "submitted",
      outcome: "success",
      fromState: "proposed",
      toState: "pending_approval",
    });

    expect(recordActionAudit).toHaveBeenCalledTimes(1);
    const arg = auditMocks.recordActionAudit.mock.calls[0]?.[0];
    expect(arg.eventCode).toBe(PRODUCTION_AUDIT_EVENT_CODES.protectedChangeSubmitted);
    expect(arg.outcome).toBe("success");
    expect(arg.organizationId).toBe(ORG);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.environmentId).toBe(ENV);
  });

  it("targets the approval_request resource keyed by the protected change id", async () => {
    await recordProtectedChangeAudit({
      ...BASE,
      action: "request_created",
      outcome: "success",
      toState: "proposed",
    });

    const arg = auditMocks.recordActionAudit.mock.calls[0]?.[0];
    expect(arg.resource).toEqual({ type: "approval_request", id: PROTECTED_CHANGE_ID });
  });

  it("emits transition_denied event code and the reason code on denial", async () => {
    await recordProtectedChangeAudit({
      ...BASE,
      action: "approved",
      outcome: "denied",
      fromState: "proposed",
      toState: "approved",
      reasonCode: PROTECTED_CHANGE_ERROR_CODES.invalidTransition,
    });

    const arg = auditMocks.recordActionAudit.mock.calls[0]?.[0];
    expect(arg.eventCode).toBe(PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied);
    expect(arg.outcome).toBe("denied");
    expect(arg.reasonCode).toBe(PROTECTED_CHANGE_ERROR_CODES.invalidTransition);
  });

  it("carries exactly the metadata-only from/to state codes as details", async () => {
    await recordProtectedChangeAudit({
      ...BASE,
      action: "approved",
      outcome: "success",
      fromState: "pending_approval",
      toState: "approved",
    });

    const arg = auditMocks.recordActionAudit.mock.calls[0]?.[0];
    expect(arg.details).toEqual({
      fromState: PROTECTED_CHANGE_STATE_CODES.pending_approval,
      toState: PROTECTED_CHANGE_STATE_CODES.approved,
    });
  });

  it("includes only the provided side of the transition in details", async () => {
    await recordProtectedChangeAudit({
      ...BASE,
      action: "request_created",
      outcome: "success",
      toState: "proposed",
    });

    const arg = auditMocks.recordActionAudit.mock.calls[0]?.[0];
    expect(arg.details).toEqual({ toState: PROTECTED_CHANGE_STATE_CODES.proposed });
  });

  it("omits details entirely when neither from nor to state is provided", async () => {
    await recordProtectedChangeAudit({
      ...BASE,
      action: "request_created",
      outcome: "success",
    });

    const arg = auditMocks.recordActionAudit.mock.calls[0]?.[0];
    expect(arg.details).toBeUndefined();
  });

  it("throws when the protected change id is not a valid opaque resource id", async () => {
    await expect(
      recordProtectedChangeAudit({
        ...BASE,
        protectedChangeId: "not-a-req-id" as typeof PROTECTED_CHANGE_ID,
        action: "request_created",
        outcome: "success",
      }),
    ).rejects.toThrow();
    expect(recordActionAudit).not.toHaveBeenCalled();
  });
});
