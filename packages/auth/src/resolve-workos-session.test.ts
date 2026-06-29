import { AUTH_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { authFailureForReason } from "./auth-failure.js";
import { authenticateWorkOSSession, refreshWorkOSSession } from "./resolve-workos-session.js";
import { createFakeWorkOSSessionPort } from "./testing/fake-workos-session.js";

const authenticateReasons = ["missing", "expired", "invalid"] as const;
const refreshReasons = ["missing", "expired", "invalid", "mfa_enrollment"] as const;

describe("authenticateWorkOSSession failure mapping", () => {
  it.each(authenticateReasons)(
    "maps %s to the same AuthFailure as authFailureForReason",
    async (reason) => {
      const workos = createFakeWorkOSSessionPort([
        {
          sessionData: `sealed_auth_${reason}`,
          userId: "user_01workos",
          sessionId: "session_auth",
          authenticateFailure: reason,
        },
      ]);

      const result = await authenticateWorkOSSession(workos, `sealed_auth_${reason}`);

      expect(result).toEqual({ ok: false, failure: authFailureForReason(reason) });
    },
  );
});

describe("refreshWorkOSSession failure mapping", () => {
  it.each(refreshReasons)(
    "maps %s to the same AuthFailure as authFailureForReason",
    async (reason) => {
      const workos = createFakeWorkOSSessionPort([
        {
          sessionData: `sealed_refresh_${reason}`,
          userId: "user_01workos",
          sessionId: "session_refresh",
          refreshFailure: reason,
        },
      ]);

      const result = await refreshWorkOSSession(workos, `sealed_refresh_${reason}`);

      expect(result).toEqual({ ok: false, failure: authFailureForReason(reason) });
    },
  );

  it("maps mfa_enrollment to auth.mfa_enrollment_required", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_refresh_mfa",
        userId: "user_01workos",
        sessionId: "session_refresh_mfa",
        refreshFailure: "mfa_enrollment",
      },
    ]);

    const result = await refreshWorkOSSession(workos, "sealed_refresh_mfa");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.mfaEnrollmentRequired);
      expect(result.failure.message).toBe("Multi-factor authentication enrollment is required.");
    }
  });
});
