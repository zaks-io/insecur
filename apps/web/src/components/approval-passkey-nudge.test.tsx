import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import {
  ApprovalPasskeyNudge,
  approvalPasskeyEnrollmentHref,
  resetApprovalPasskeyNudgeDismissalForTests,
} from "./approval-passkey-nudge.js";

describe("approvalPasskeyEnrollmentHref", () => {
  it("encodes the post-enrollment return path", () => {
    expect(approvalPasskeyEnrollmentHref("/orgs/org_01")).toBe(
      "/auth/enroll-passkey?returnTo=%2Forgs%2Forg_01",
    );
  });
});

describe("ApprovalPasskeyNudge", () => {
  beforeEach(() => {
    resetApprovalPasskeyNudgeDismissalForTests();
  });

  it("renders nothing when the member already has an approval passkey", () => {
    const html = renderToStaticMarkup(<ApprovalPasskeyNudge enrolled returnTo="/orgs/org_01" />);
    expect(html).toBe("");
  });

  it("renders enrollment guidance when no passkey exists", () => {
    const html = renderToStaticMarkup(
      <ApprovalPasskeyNudge enrolled={false} returnTo="/orgs/org_01" />,
    );
    expect(html).toContain("Approval passkey not set up");
    expect(html).toContain(approvalPasskeyEnrollmentHref("/orgs/org_01"));
  });

  it("surfaces enrollment failure when redirected back from AuthKit", () => {
    const html = renderToStaticMarkup(
      <ApprovalPasskeyNudge enrolled={false} returnTo="/orgs/org_01" enrollmentError />,
    );
    expect(html).toContain("Passkey enrollment didn");
  });
});
