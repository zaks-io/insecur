import { describe, expect, it } from "vitest";
import { evaluateSessionAssurance } from "./session-assurance.js";

describe("evaluateSessionAssurance", () => {
  it("accepts passkey authentication without enrolled factors", () => {
    const result = evaluateSessionAssurance({
      authenticationMethod: "Passkey",
      authFactors: [],
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts password sessions when eligible MFA factors are enrolled", () => {
    const result = evaluateSessionAssurance({
      authenticationMethod: "Password",
      authFactors: [{ type: "totp" }],
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects SMS factors", () => {
    const result = evaluateSessionAssurance({
      authenticationMethod: "Password",
      authFactors: [{ type: "sms" }],
    });
    expect(result).toEqual({ ok: false, reason: "sms_not_allowed" });
  });

  it("requires MFA enrollment when no eligible factors exist", () => {
    const result = evaluateSessionAssurance({
      authenticationMethod: "Password",
      authFactors: [],
    });
    expect(result).toEqual({ ok: false, reason: "mfa_enrollment" });
  });

  it("rejects magic-auth sessions even when MFA factors exist", () => {
    const result = evaluateSessionAssurance({
      authenticationMethod: "MagicAuth",
      authFactors: [{ type: "totp" }],
    });
    expect(result).toEqual({ ok: false, reason: "insufficient_assurance" });
  });
});
