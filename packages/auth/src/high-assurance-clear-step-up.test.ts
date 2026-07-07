import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  buildHighAssuranceClearAssuranceFromWorkOSContext,
  deriveFreshStepUpFactorFromWorkOSContext,
  resolveHighAssuranceClearAssuranceFromWorkOSStepUp,
} from "./high-assurance-clear-step-up.js";
import { createFakeWorkOSSessionPort } from "./testing/fake-workos-session.js";
import type { UserActor } from "./user-actor.js";

const actor: UserActor = {
  type: "user",
  userId: userId.brand("usr_00000000000000000000000001"),
  workosUserId: "user_01workos",
  sessionId: "session_step_up",
};

describe("deriveFreshStepUpFactorFromWorkOSContext", () => {
  it("maps passkey authentication to passkey step-up", () => {
    expect(
      deriveFreshStepUpFactorFromWorkOSContext({
        user: { id: actor.workosUserId },
        sessionId: actor.sessionId,
        authenticationMethod: "Passkey",
        authFactors: [],
      }),
    ).toBe("passkey");
  });

  it("maps password sessions with enrolled TOTP to totp step-up", () => {
    expect(
      deriveFreshStepUpFactorFromWorkOSContext({
        user: { id: actor.workosUserId },
        sessionId: actor.sessionId,
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      }),
    ).toBe("totp");
  });
});

describe("resolveHighAssuranceClearAssuranceFromWorkOSStepUp", () => {
  it("accepts server-verified step-up for the same user and session", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_step_up",
        userId: actor.workosUserId,
        sessionId: actor.sessionId,
        authorizationCode: "code_step_up",
        codeVerifier: "verifier_step_up",
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      },
    ]);

    const result = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
      workos,
      actor,
      stepUpCode: "code_step_up",
      stepUpCodeVerifier: "verifier_step_up",
    });

    expect(result).toEqual({
      ok: true,
      sessionAssurance: {
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
        freshStepUpFactor: "totp",
      },
    });
  });

  it("rejects step-up when WorkOS user does not match the acting credential", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_other_user",
        userId: "user_other",
        sessionId: actor.sessionId,
        authorizationCode: "code_other_user",
        codeVerifier: "verifier_other_user",
        authenticationMethod: "Passkey",
      },
    ]);

    const result = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
      workos,
      actor,
      stepUpCode: "code_other_user",
      stepUpCodeVerifier: "verifier_other_user",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("invalid");
    }
  });

  it("rejects step-up when WorkOS session does not match the acting credential", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_other_session",
        userId: actor.workosUserId,
        sessionId: "session_other",
        authorizationCode: "code_other_session",
        codeVerifier: "verifier_other_session",
        authenticationMethod: "Passkey",
      },
    ]);

    const result = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
      workos,
      actor,
      stepUpCode: "code_other_session",
      stepUpCodeVerifier: "verifier_other_session",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("invalid");
    }
  });

  it("rejects step-up without an eligible enrolled factor", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_no_factor",
        userId: actor.workosUserId,
        sessionId: actor.sessionId,
        authorizationCode: "code_no_factor",
        codeVerifier: "verifier_no_factor",
        authenticationMethod: "Password",
        authFactors: [],
      },
    ]);

    const result = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
      workos,
      actor,
      stepUpCode: "code_no_factor",
      stepUpCodeVerifier: "verifier_no_factor",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("mfa_enrollment");
    }
  });
});

describe("buildHighAssuranceClearAssuranceFromWorkOSContext", () => {
  it("returns null when no fresh step-up factor can be derived", () => {
    expect(
      buildHighAssuranceClearAssuranceFromWorkOSContext({
        user: { id: actor.workosUserId },
        sessionId: actor.sessionId,
        authenticationMethod: "MagicAuth",
        authFactors: [],
      }),
    ).toBeNull();
  });
});
