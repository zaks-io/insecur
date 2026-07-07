import { describe, expect, it } from "vitest";
import { hasApprovalPasskey, hasEnrolledPasskeyFactor } from "./mfa-posture.js";

describe("hasEnrolledPasskeyFactor", () => {
  it("accepts a passkey auth factor row", () => {
    expect(hasEnrolledPasskeyFactor([{ type: "passkey" }])).toBe(true);
  });

  it("rejects totp-only enrollment", () => {
    expect(hasEnrolledPasskeyFactor([{ type: "totp" }])).toBe(false);
  });
});

describe("hasApprovalPasskey", () => {
  it("accepts passkey sign-in without a separate factor row", () => {
    expect(
      hasApprovalPasskey({
        authenticationMethod: "Passkey",
        authFactors: [],
      }),
    ).toBe(true);
  });

  it("accepts password sessions with an enrolled passkey factor", () => {
    expect(
      hasApprovalPasskey({
        authenticationMethod: "Password",
        authFactors: [{ type: "passkey" }],
      }),
    ).toBe(true);
  });

  it("rejects password sessions with only totp factors", () => {
    expect(
      hasApprovalPasskey({
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      }),
    ).toBe(false);
  });
});
