import { describe, expect, it } from "vitest";
import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  validateAuditEventInput,
  AuditEventValidationError,
} from "../src/index.js";
import {
  environmentId,
  injectionGrantId,
  operationId,
  organizationId,
  projectId,
  requestId,
  secretId,
  userId,
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
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        denial: { reasonCode: "auth.insufficient_scope" },
      });
    }).not.toThrow();
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
