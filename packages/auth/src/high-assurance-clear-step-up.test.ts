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

  it("does not treat enrolled TOTP as proof of a fresh TOTP step-up", () => {
    expect(
      deriveFreshStepUpFactorFromWorkOSContext({
        user: { id: actor.workosUserId },
        sessionId: actor.sessionId,
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      }),
    ).toBeNull();
  });
});

describe("resolveHighAssuranceClearAssuranceFromWorkOSStepUp", () => {
  it("rejects password reauthentication when TOTP is only enrolled", async () => {
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

    expect(result).toMatchObject({
      ok: false,
      failure: { reason: "mfa_enrollment" },
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

  // Regression guard for INS-517: a WorkOS authorization code is single-use. If any caller (the
  // BFF, historically) exchanges the step-up code before the API's authoritative resolve, the
  // second exchange must fail closed rather than silently succeed. The fake now invalidates the
  // code on first exchange so this double-exchange path is caught in tests.
  it("fails closed when the step-up code was already exchanged once", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_double_exchange",
        userId: actor.workosUserId,
        sessionId: actor.sessionId,
        authorizationCode: "code_double_exchange",
        codeVerifier: "verifier_double_exchange",
        authenticationMethod: "Passkey",
      },
    ]);

    const first = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
      workos,
      actor,
      stepUpCode: "code_double_exchange",
      stepUpCodeVerifier: "verifier_double_exchange",
    });
    expect(first.ok).toBe(true);

    const second = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
      workos,
      actor,
      stepUpCode: "code_double_exchange",
      stepUpCodeVerifier: "verifier_double_exchange",
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.failure.reason).toBe("invalid");
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
