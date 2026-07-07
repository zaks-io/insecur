import { describe, expect, it } from "vitest";
import {
  APPROVAL_PASSKEY_ENROLLED_METADATA_KEY,
  hasApprovalPasskey,
  parseApprovalPasskeyEnrolledMetadata,
} from "./mfa-posture.js";

describe("parseApprovalPasskeyEnrolledMetadata", () => {
  it("accepts the AuthKit enrollment metadata marker", () => {
    expect(
      parseApprovalPasskeyEnrolledMetadata({
        [APPROVAL_PASSKEY_ENROLLED_METADATA_KEY]: "true",
      }),
    ).toBe(true);
  });

  it("rejects missing or legacy MFA-only metadata", () => {
    expect(parseApprovalPasskeyEnrolledMetadata(undefined)).toBe(false);
    expect(parseApprovalPasskeyEnrolledMetadata({ totp_enrolled: "true" })).toBe(false);
  });
});

describe("hasApprovalPasskey", () => {
  it("accepts passkey sign-in from AuthKit session authentication data", () => {
    expect(
      hasApprovalPasskey({
        authenticationMethod: "Passkey",
      }),
    ).toBe(true);
  });

  it("accepts password sessions after AuthKit enrollment metadata is recorded", () => {
    expect(
      hasApprovalPasskey({
        authenticationMethod: "Password",
        registeredPasskey: true,
      }),
    ).toBe(true);
  });

  it("rejects password sessions without AuthKit passkey enrollment evidence", () => {
    expect(
      hasApprovalPasskey({
        authenticationMethod: "Password",
        registeredPasskey: false,
      }),
    ).toBe(false);
  });
});
