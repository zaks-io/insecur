import { describe, expect, it } from "vitest";
import { evaluateHighAssuranceChallengeClearAssurance } from "./high-assurance-challenge-clear-assurance.js";

describe("evaluateHighAssuranceChallengeClearAssurance", () => {
  it("accepts passkey sessions without fresh step-up metadata", () => {
    expect(
      evaluateHighAssuranceChallengeClearAssurance({
        authenticationMethod: "Passkey",
        authFactors: [],
      }),
    ).toEqual({ ok: true });
  });

  it("accepts password sessions with fresh TOTP step-up evidence", () => {
    expect(
      evaluateHighAssuranceChallengeClearAssurance({
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
        freshStepUpFactor: "totp",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects password sessions with enrolled TOTP but no fresh step-up", () => {
    expect(
      evaluateHighAssuranceChallengeClearAssurance({
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      }),
    ).toEqual({ ok: false, reason: "fresh_step_up_required" });
  });

  it("rejects magic-auth sessions even when MFA factors are enrolled", () => {
    expect(
      evaluateHighAssuranceChallengeClearAssurance({
        authenticationMethod: "MagicAuth",
        authFactors: [{ type: "totp" }],
      }),
    ).toEqual({ ok: false, reason: "insufficient_assurance" });
  });

  it("rejects SMS factors", () => {
    expect(
      evaluateHighAssuranceChallengeClearAssurance({
        authenticationMethod: "Password",
        authFactors: [{ type: "sms" }],
        freshStepUpFactor: "totp",
      }),
    ).toEqual({ ok: false, reason: "sms_not_allowed" });
  });
});
