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

  it("defers rendering until client hydration", () => {
    const html = renderToStaticMarkup(
      <ApprovalPasskeyNudge enrolled={false} returnTo="/orgs/org_01" />,
    );
    expect(html).toBe("");
  });

  it("surfaces enrollment failure when redirected back from AuthKit", () => {
    const html = renderToStaticMarkup(
      <ApprovalPasskeyNudge enrolled={false} returnTo="/orgs/org_01" enrollmentError />,
    );
    expect(html).toBe("");
  });
});
