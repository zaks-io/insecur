import * as audit from "@insecur/audit";
import {
  OPAQUE_RESOURCE_ID_BODY_PATTERN,
  OPAQUE_RESOURCE_ID_PATTERN,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { buildChallengeRequestActorSuccessAuditEvent } from "../src/challenge-audit-helpers.js";
import { generateChallengeId } from "../src/high-assurance-challenge-helpers.js";
import { HIGH_ASSURANCE_RISK_REASON_CODES } from "../src/high-assurance-risk-reason-codes.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");

const CROCKFORD_BODY_PATTERN = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

describe("generateChallengeId", () => {
  it("returns Crockford opaque resource ids accepted by audit metadata validation", () => {
    for (let i = 0; i < 20; i += 1) {
      const challengeId = generateChallengeId();
      expect(challengeId).toMatch(OPAQUE_RESOURCE_ID_PATTERN);
      const body = challengeId.slice("chlg_".length);
      expect(body).toMatch(OPAQUE_RESOURCE_ID_BODY_PATTERN);
      expect(body).toMatch(CROCKFORD_BODY_PATTERN);

      expect(() => {
        audit.validateAuditEventInput(
          buildChallengeRequestActorSuccessAuditEvent(
            audit.PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequested,
            {
              organizationId: ORG,
              projectId: PRJ,
              operationId: OP,
              requestingUserId: USER,
              challengeId,
              riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy,
            },
          ),
        );
      }).not.toThrow();
    }
  });
});
