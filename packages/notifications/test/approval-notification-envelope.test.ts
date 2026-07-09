import { describe, expect, it } from "vitest";

import {
  assertApprovalNotificationEnvelopeSafe,
  buildApprovalDeepLinkUrl,
  serializeApprovalNotificationEnvelope,
  type ApprovalNotificationEnvelope,
} from "../src/approval-notification-envelope.js";

const ORG = "org_00000000000000000000000001";
const APPROVAL = "apr_00000000000000000000000001";
const WEB_BASE = "https://app.insecur.cloud";

function safeEnvelope(
  overrides: Partial<ApprovalNotificationEnvelope> = {},
): ApprovalNotificationEnvelope {
  return {
    kind: "approval_notification",
    alert: "approval_pending",
    organizationId: ORG,
    approvalRequestId: APPROVAL,
    createdAt: "2026-07-07T00:00:00.000Z",
    deepLinkUrl: buildApprovalDeepLinkUrl({
      webBaseUrl: WEB_BASE,
      organizationId: ORG,
      approvalRequestId: APPROVAL,
    }),
    ...overrides,
  };
}

describe("buildApprovalDeepLinkUrl", () => {
  it("targets the authenticated approval view route", () => {
    expect(
      buildApprovalDeepLinkUrl({
        webBaseUrl: WEB_BASE,
        organizationId: ORG,
        approvalRequestId: APPROVAL,
      }),
    ).toBe(`${WEB_BASE}/orgs/${ORG}/approvals/${APPROVAL}`);
  });

  it("normalizes a trailing slash on the base url", () => {
    expect(
      buildApprovalDeepLinkUrl({
        webBaseUrl: `${WEB_BASE}///`,
        organizationId: ORG,
        approvalRequestId: APPROVAL,
      }),
    ).toBe(`${WEB_BASE}/orgs/${ORG}/approvals/${APPROVAL}`);
  });
});

describe("assertApprovalNotificationEnvelopeSafe", () => {
  it("accepts a metadata-safe envelope", () => {
    expect(() => assertApprovalNotificationEnvelopeSafe(safeEnvelope())).not.toThrow();
  });

  it("serializes only the allowlisted keys", () => {
    const serialized = JSON.parse(serializeApprovalNotificationEnvelope(safeEnvelope())) as Record<
      string,
      unknown
    >;
    expect(Object.keys(serialized).sort()).toEqual([
      "alert",
      "approvalRequestId",
      "createdAt",
      "deepLinkUrl",
      "kind",
      "organizationId",
    ]);
  });

  // Security core: every enumerated exclusion (product-spec §10, ADR-0017) fails loudly.
  const forbiddenFields: readonly [string, unknown][] = [
    ["approvalContextNote", "please ship this before the demo"],
    ["contextNote", "please ship this before the demo"],
    ["rejectionNote", "denied for reason x"],
    ["displayName", "Production"],
    ["displayNames", { environment: "Production" }],
    ["sensitiveValue", "sk_live_deadbeef"],
    ["secretValue", "sk_live_deadbeef"],
    ["secret", "sk_live_deadbeef"],
    ["sensitiveMetadata", { key: "STRIPE_KEY" }],
    ["impact", { addedTargets: 3 }],
    ["approvalImpact", { addedTargets: 3 }],
    ["impactReview", { addedTargets: 3 }],
    ["approveUrl", `${WEB_BASE}/approve`],
    ["rejectUrl", `${WEB_BASE}/reject`],
    ["approveLink", `${WEB_BASE}/approve`],
    ["rejectLink", `${WEB_BASE}/reject`],
    ["actionUrl", `${WEB_BASE}/approve`],
    ["actionLink", `${WEB_BASE}/approve`],
  ];

  it.each(forbiddenFields)("rejects a payload carrying %s", (key, value) => {
    const leaking = { ...safeEnvelope(), [key]: value } as unknown as ApprovalNotificationEnvelope;
    expect(() => assertApprovalNotificationEnvelopeSafe(leaking)).toThrow(/forbidden|disallowed/);
  });

  it("rejects any non-allowlisted key even if not on the forbidden list", () => {
    const leaking = {
      ...safeEnvelope(),
      surpriseField: "leak",
    } as unknown as ApprovalNotificationEnvelope;
    expect(() => assertApprovalNotificationEnvelopeSafe(leaking)).toThrow(/disallowed key/);
  });

  it("rejects a deep link that carries an approve action query", () => {
    const url = new URL(
      buildApprovalDeepLinkUrl({
        webBaseUrl: WEB_BASE,
        organizationId: ORG,
        approvalRequestId: APPROVAL,
      }),
    );
    url.searchParams.set("action", "approve");
    expect(() =>
      assertApprovalNotificationEnvelopeSafe(safeEnvelope({ deepLinkUrl: url.toString() })),
    ).toThrow(/query or fragment/);
  });

  it("rejects a deep link that points anywhere other than the approval view", () => {
    expect(() =>
      assertApprovalNotificationEnvelopeSafe(
        safeEnvelope({ deepLinkUrl: `${WEB_BASE}/orgs/${ORG}/approvals/${APPROVAL}/approve` }),
      ),
    ).toThrow(/authenticated approval view/);
  });

  it("rejects a non-https deep link", () => {
    expect(() =>
      assertApprovalNotificationEnvelopeSafe(
        safeEnvelope({ deepLinkUrl: `http://app.insecur.cloud/orgs/${ORG}/approvals/${APPROVAL}` }),
      ),
    ).toThrow(/https/);
  });

  it("rejects an unexpected alert shape", () => {
    expect(() =>
      assertApprovalNotificationEnvelopeSafe(
        safeEnvelope({ alert: "approved" as ApprovalNotificationEnvelope["alert"] }),
      ),
    ).toThrow(/alert shape/);
  });
});
