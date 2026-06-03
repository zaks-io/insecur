import { describe, expect, it } from "vitest";
import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  validateAuditEventInput,
  AuditEventValidationError,
} from "../src/index.js";
import {
  AUTH_ERROR_CODES,
  environmentId,
  INJECTION_ERROR_CODES,
  injectionGrantId,
  operationId,
  organizationId,
  projectId,
  requestId,
  SECRET_ERROR_CODES,
  secretId,
  secretVersionId,
  userId,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const REQUEST = requestId.brand("req_00000000000000000000000001");
const OPERATION = operationId.brand("op_00000000000000000000000001");

describe("audit metadata allowlist", () => {
  it("accepts grant consume success with delivered secret version related resource", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        resource: { type: "injection_grant", id: GRANT },
        relatedResource: {
          type: "secret_version",
          id: secretVersionId.brand("sv_00000000000000000000000001"),
        },
      });
    }).not.toThrow();
  });

  it("accepts metadata-only successful secret write events", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        resource: { type: "secret", id: SECRET },
        request: { requestId: REQUEST },
        operation: { operationId: OPERATION },
      });
    }).not.toThrow();
  });

  it("accepts denied events with stable reason codes only", () => {
    const validReasonCodes = [
      AUTH_ERROR_CODES.insufficientScope,
      SECRET_ERROR_CODES.invalidEncoding,
      INJECTION_ERROR_CODES.grantDenied,
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    ];

    for (const reasonCode of validReasonCodes) {
      expect(() => {
        validateAuditEventInput({
          eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
          outcome: "denied",
          actor: { type: "user", userId: USER },
          organizationId: ORG,
          denial: { reasonCode },
        });
      }).not.toThrow();
    }
  });

  it("rejects non-dotted or free-form denial reasonCode values", () => {
    const invalidReasonCodes = [
      "not_a_dotted_code",
      "auth",
      "AUTH.insufficient_scope",
      "auth.insufficient scope",
      "Error: access denied",
      "secret value was invalid",
      "auth..insufficient_scope",
      "",
    ];

    for (const reasonCode of invalidReasonCodes) {
      expect(() => {
        validateAuditEventInput({
          eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
          outcome: "denied",
          actor: { type: "user", userId: USER },
          organizationId: ORG,
          denial: { reasonCode },
        });
      }).toThrow(/stable dotted code/);
    }
  });

  it("rejects forbidden sensitive-value keys anywhere in the payload", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        value: "must-not-appear",
      } as never);
    }).toThrow(/forbidden key: value/);

    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        resource: { type: "injection_grant", id: GRANT },
        denial: { reasonCode: "injection.grant_denied", plaintext: "nope" },
      } as never);
    }).toThrow(/forbidden key: plaintext/);
  });

  it("rejects binary payloads and non-plain objects", () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        wrappedValue: bytes,
      } as never);
    }).toThrow(/forbidden key: wrappedValue/);

    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        denial: { reasonCode: "auth.insufficient_scope" },
        details: new Map([["k", "v"]]),
      } as never);
    }).toThrow(/non-plain object/);
  });

  it("requires denied event names and denial metadata for denied outcomes", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        denial: { reasonCode: "auth.insufficient_scope" },
      });
    }).toThrow(AuditEventValidationError);

    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
      } as never);
    }).toThrow(AuditEventValidationError);
  });

  it("accepts production sync and approval denied events with stable codes", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: "sync.revalidation_denied",
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        denial: { reasonCode: "sync.provider_drift" },
        operation: { operationId: OPERATION },
      });
    }).not.toThrow();
  });

  it("rejects success outcomes on denied-only event names", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
      });
    }).toThrow(AuditEventValidationError);
  });
});
