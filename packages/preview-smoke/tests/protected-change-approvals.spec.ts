import { approvalRequestId, environmentId, secretId, secretVersionId } from "@insecur/domain";

import {
  asRecord,
  assertEnvelopeData,
  assertEnvelopeError,
  assertEqual,
  assertResponseFreeOfRedactedPatterns,
  assertStatus,
  authHeaders,
  findById,
  getJson,
  mintSmokeSentinel,
  mutateSmokeProtectedPromotionDraftImpact,
  provisionFirstValueCoords,
  readJsonResponse,
  redactorFor,
  requireBoolean,
  requireObjectArray,
  requireString,
  seedSmokeProtectedPromotionApprovalRequest,
  seedSmokeProtectedPromotionDraft,
  test,
  updateSmokeProtectedPromotionApprovalFingerprint,
} from "../src/fixtures";

test("preview protected-change approval request gate/list/stale read @preview @custody @approval", async ({
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
  const seededApprovalRequestId = approvalRequestId.generate();

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

  await test.step("protected_change.promote_create_requires_step_up", async () => {
    const label = "Protected promotion request high-assurance gate";
    const response = await fetch(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${protectedEnvironmentId}/promote`,
      {
        body: JSON.stringify({
          comment: "Preview smoke protected promotion metadata proof.",
          draftVersionIds: [draftVersionId],
        }),
        headers: { ...authHeaders(ownerBearer), "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const text = await response.text();
    assertStatus(response, 401, label, { bodyText: text, redactor });
    const body = await readJsonResponse(response, label, text);
    assertResponseFreeOfRedactedPatterns(redactor, body, label);
    assertEnvelopeError(body, "auth.high_assurance_required", label);
    const meta = asRecord(body.meta, `${label} meta`);
    requireString(meta.operationId, `${label} operationId`);
  });

  let fingerprintAtCreation = "";

  await test.step("protected_change.seed_pending_approval_request", async () => {
    await seedSmokeProtectedPromotionApprovalRequest({
      approvalRequestId: seededApprovalRequestId,
      createdByUserId: preview.ownerUserId,
      databaseUrl: preview.databaseUrl,
      environmentId: protectedEnvironmentId,
      impactReviewFingerprint: "sha256:preview-smoke-seeded-before-review",
      organizationId: coords.organizationId,
      projectId: coords.projectId,
      secretId: protectedSecretId,
      secretVersionId: draftVersionId,
    });
  });

  await test.step("protected_change.capture_current_fingerprint", async () => {
    const detail = await loadApprovalDetail({
      approvalRequestId: seededApprovalRequestId,
      bearer: ownerBearer,
      label: "Approval request detail initial",
      organizationId: coords.organizationId,
      previewApiBaseUrl: preview.apiBaseUrl,
      redactor,
    });
    const impactReview = asRecord(
      detail.impactReview,
      "Approval request detail initial impactReview",
    );
    fingerprintAtCreation = requireString(
      impactReview.currentFingerprint,
      "Approval request detail initial currentFingerprint",
    );
    assertEqual(
      fingerprintAtCreation.startsWith("sha256:"),
      true,
      "Approval request detail initial fingerprint prefix",
    );
    await updateSmokeProtectedPromotionApprovalFingerprint({
      approvalRequestId: seededApprovalRequestId,
      databaseUrl: preview.databaseUrl,
      impactReviewFingerprint: fingerprintAtCreation,
      organizationId: coords.organizationId,
    });
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
      seededApprovalRequestId,
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
      seededApprovalRequestId,
      "Pending approval request list",
    );
  });

  await test.step("protected_change.approval_detail_fresh", async () => {
    const detail = await loadApprovalDetail({
      approvalRequestId: seededApprovalRequestId,
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
      approvalRequestId: seededApprovalRequestId,
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
      "Promotion create and approve/execute are intentionally not completed in preview-smoke: POST " +
      "/v1/orgs/:organizationId/projects/:projectId/environments/:environmentId/promote returns " +
      "auth.high_assurance_required without server-verified WorkOS step-up, and POST " +
      "/v1/orgs/:organizationId/approval-requests/:approvalRequestId/approve requires a " +
      "server-verified WorkOS step-up exchange. This smoke asserts the live create gate, seeds " +
      "metadata-only pending review state, then covers preview-reachable list, detail, and " +
      "stale-read paths without faking human step-up.",
    type: "protected_change.create_approve_not_completed",
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
