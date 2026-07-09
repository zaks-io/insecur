import { environmentId, secretId, secretVersionId } from "@insecur/domain";

import {
  asRecord,
  assertEnvelopeData,
  assertEqual,
  assertResponseFreeOfRedactedPatterns,
  authHeaders,
  findById,
  getJson,
  mintSmokeSentinel,
  mutateSmokeProtectedPromotionDraftImpact,
  postJson,
  provisionFirstValueCoords,
  redactorFor,
  requireBoolean,
  requireObjectArray,
  requireString,
  seedSmokeProtectedPromotionDraft,
  test,
} from "../src/fixtures";

test("preview protected-change approval request create/list/stale read @preview @custody @approval", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  const sentinel = mintSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer]);
  const variableKey = `SMOKE_PROTECTED_APPROVAL_${String(Date.now())}`;

  const coords = await test.step("provision.first_value", async () =>
    provisionFirstValueCoords({
      apiBaseUrl: preview.apiBaseUrl,
      bearer: ownerBearer,
      redactor,
      sentinel,
      variableKey,
    }));

  const protectedEnvironmentId = environmentId.generate();
  const protectedSecretId = secretId.generate();
  const draftVersionId = secretVersionId.generate();

  await test.step("protected_change.seed_protected_draft", async () => {
    await seedSmokeProtectedPromotionDraft({
      createdByUserId: preview.ownerUserId,
      databaseUrl: preview.databaseUrl,
      environmentId: protectedEnvironmentId,
      organizationId: coords.organizationId,
      projectId: coords.projectId,
      secretId: protectedSecretId,
      secretVersionId: draftVersionId,
      variableKey,
    });
  });

  let approvalRequestId = "";
  let fingerprintAtCreation = "";

  await test.step("protected_change.promote_create_request", async () => {
    const body = await postJson({
      bearer: ownerBearer,
      body: {
        comment: "Preview smoke protected promotion metadata proof.",
        draftVersionIds: [draftVersionId],
      },
      label: "Protected promotion request",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${protectedEnvironmentId}/promote`,
    });
    assertResponseFreeOfRedactedPatterns(redactor, body, "Protected promotion request");
    const data = assertEnvelopeData(body, "Protected promotion request");

    approvalRequestId = requireString(
      data.approvalRequestId,
      "Protected promotion request approvalRequestId",
    );
    fingerprintAtCreation = requireString(
      data.impactReviewFingerprint,
      "Protected promotion request impactReviewFingerprint",
    );
    assertEqual(
      approvalRequestId.startsWith("apr_"),
      true,
      "Protected promotion request approvalRequestId prefix",
    );
    assertEqual(
      fingerprintAtCreation.startsWith("sha256:"),
      true,
      "Protected promotion request fingerprint prefix",
    );
    const draftVersionIds = requireStringArray(
      data.draftVersionIds,
      "Protected promotion request draftVersionIds",
    );
    assertEqual(draftVersionIds[0], draftVersionId, "Protected promotion request draftVersionId");
  });

  await test.step("protected_change.environment_approvals_list", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${protectedEnvironmentId}/approvals`,
      "Environment approval request list",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Environment approval request list");
    const data = assertEnvelopeData(body, "Environment approval request list");
    const approvals = requireObjectArray(data.approvals, "Environment approval request list");
    const approval = findById(
      approvals,
      "approvalRequestId",
      approvalRequestId,
      "Environment approval request list",
    );
    assertEqual(approval.status, "pending", "Environment approval request status");
    assertEqual(approval.purpose, "protected_promotion", "Environment approval request purpose");
  });

  await test.step("protected_change.pending_approval_list", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/approval-requests`,
      "Pending approval request list",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Pending approval request list");
    const data = assertEnvelopeData(body, "Pending approval request list");
    const approvalRequests = requireObjectArray(
      data.approvalRequests,
      "Pending approval request list",
    );
    findById(
      approvalRequests,
      "approvalRequestId",
      approvalRequestId,
      "Pending approval request list",
    );
  });

  await test.step("protected_change.approval_detail_fresh", async () => {
    const detail = await loadApprovalDetail({
      approvalRequestId,
      bearer: ownerBearer,
      label: "Approval request detail fresh",
      organizationId: coords.organizationId,
      previewApiBaseUrl: preview.apiBaseUrl,
      redactor,
    });
    const impactReview = asRecord(
      detail.impactReview,
      "Approval request detail fresh impactReview",
    );
    assertEqual(
      impactReview.fingerprintAtCreation,
      fingerprintAtCreation,
      "Approval request detail fresh fingerprintAtCreation",
    );
    assertEqual(
      impactReview.currentFingerprint,
      fingerprintAtCreation,
      "Approval request detail fresh currentFingerprint",
    );
    assertEqual(
      requireBoolean(impactReview.isStale, "Approval request detail fresh isStale"),
      false,
      "Approval request detail fresh isStale",
    );
  });

  await test.step("protected_change.mutate_target_impact", async () => {
    await mutateSmokeProtectedPromotionDraftImpact({
      databaseUrl: preview.databaseUrl,
      organizationId: coords.organizationId,
      secretVersionId: draftVersionId,
      valueByteLength: 25,
    });
  });

  await test.step("protected_change.approval_detail_stale", async () => {
    const detail = await loadApprovalDetail({
      approvalRequestId,
      bearer: ownerBearer,
      label: "Approval request detail stale",
      organizationId: coords.organizationId,
      previewApiBaseUrl: preview.apiBaseUrl,
      redactor,
    });
    const impactReview = asRecord(
      detail.impactReview,
      "Approval request detail stale impactReview",
    );
    assertEqual(
      requireBoolean(impactReview.isStale, "Approval request detail stale isStale"),
      true,
      "Approval request detail stale isStale",
    );
    if (impactReview.currentFingerprint === fingerprintAtCreation) {
      throw new Error("Approval request detail stale currentFingerprint did not change.");
    }
  });

  test.info().annotations.push({
    description:
      "Approve/execute is intentionally not exercised in preview-smoke: POST " +
      "/v1/orgs/:organizationId/approval-requests/:approvalRequestId/approve requires a " +
      "server-verified WorkOS step-up exchange. This smoke covers the preview-reachable create, " +
      "list, detail, and stale-read path without faking human step-up.",
    type: "protected_change.approve_not_exercised",
  });
});

async function loadApprovalDetail(input: {
  readonly approvalRequestId: string;
  readonly bearer: string;
  readonly label: string;
  readonly organizationId: string;
  readonly previewApiBaseUrl: string;
  readonly redactor: (value: unknown) => string;
}) {
  const body = await getJson(
    `${input.previewApiBaseUrl}/v1/orgs/${input.organizationId}/approval-requests/${input.approvalRequestId}`,
    input.label,
    { headers: authHeaders(input.bearer) },
    input.redactor,
  );
  assertResponseFreeOfRedactedPatterns(input.redactor, body, input.label);
  const data = assertEnvelopeData(body, input.label);
  return asRecord(data.approvalRequest, `${input.label} approvalRequest`);
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => requireString(entry, `${label}[${String(index)}]`));
}
