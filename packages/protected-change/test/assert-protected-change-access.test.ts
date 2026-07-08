import { AUTH_ERROR_CODES, PROTECTED_CHANGE_ERROR_CODES, requestId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  assertApprovalEvidencePresent,
  assertProtectedEnvironmentCoordinate,
  isProtectedChangeAccessDenied,
} from "../src/assert-protected-change-access.js";
import { ProtectedChangeError } from "../src/protected-change-errors.js";
import type { ProtectedChangeRecord } from "../src/protected-change-types.js";

const RECORD: ProtectedChangeRecord = {
  protectedChangeId: requestId.brand("req_00000000000000000000000001"),
  organizationId: "org_00000000000000000000000001" as ProtectedChangeRecord["organizationId"],
  projectId: "prj_00000000000000000000000001" as ProtectedChangeRecord["projectId"],
  environmentId: "env_00000000000000000000000001" as ProtectedChangeRecord["environmentId"],
  state: "pending_approval",
  purpose: "promotion",
  requesterUserId: "usr_00000000000000000000000001" as ProtectedChangeRecord["requesterUserId"],
  requesterMachineIdentityId: null,
  draftVersionIds: [],
  impactReviewFingerprint: null,
  executionOperationId: null,
  closureReasonCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("protected change access helpers", () => {
  it("fails closed for non-protected environments", () => {
    expect(() =>
      assertProtectedEnvironmentCoordinate({
        isProtected: false,
        organizationId: RECORD.organizationId,
        projectId: RECORD.projectId,
        environmentId: RECORD.environmentId,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: PROTECTED_CHANGE_ERROR_CODES.nonProtectedEnvironment,
      }),
    );
  });

  it("requires approval evidence fingerprint before approval", () => {
    expect(() => assertApprovalEvidencePresent(undefined)).toThrowError(
      expect.objectContaining({
        code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      }),
    );
  });

  it("classifies resolver and protected-change denials", () => {
    expect(
      isProtectedChangeAccessDenied(
        Object.assign(new Error("denied"), { code: AUTH_ERROR_CODES.insufficientScope }),
      ),
    ).toBe(true);
    expect(
      isProtectedChangeAccessDenied(
        new ProtectedChangeError(
          PROTECTED_CHANGE_ERROR_CODES.requesterMismatch,
          "requester mismatch",
        ),
      ),
    ).toBe(true);
    expect(isProtectedChangeAccessDenied(new Error("other"))).toBe(false);
  });
});
