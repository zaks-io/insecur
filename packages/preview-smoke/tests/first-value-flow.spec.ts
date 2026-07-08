import { Buffer } from "node:buffer";

import { INJECTION_ERROR_CODES } from "@insecur/domain";

import {
  annotateVerifiedAuditEventCodes,
  asRecord,
  assertCrossOrganizationOperationPollDenied,
  assertEnvelopeData,
  assertEnvelopeError,
  assertEqual,
  assertOperationPollEnvelope,
  assertStatus,
  authHeaders,
  getJson,
  invitationId,
  membershipId,
  mintProtectedEnvironmentId,
  mintRunPolicyId,
  mintSmokeSentinel,
  postJson,
  provisionProtectedSmokeEnvironment,
  readJsonResponse,
  redactorFor,
  requestRunPolicyOperationHandoff,
  requireString,
  runPlaintextSweep,
  test,
  verifyFirstValueAuditEvidence,
} from "../src/fixtures";

test("preview first-value and membership happy path @preview @happy-path @custody", async ({
  inviteeBearer,
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  const sentinel = mintSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer, inviteeBearer]);
  const variableKey = `SMOKE_PREVIEW_${String(Date.now())}`;
  let operationId = "";
  let secretId = "";
  let secondaryOrganizationId = "";
  let invitation = "";
  let coords = {
    defaultTeamId: "",
    environmentId: "",
    organizationId: "",
    ownerMembershipId: "",
    projectId: "",
  };
  let grantId = "";
  let feedbackId = "";

  await test.step("onboarding.personal_organization", async () => {
    const body = await postJson({
      bearer: ownerBearer,
      body: {},
      label: "Guided onboarding",
      redactor,
      url: `${preview.apiBaseUrl}/v1/onboarding/personal-organization`,
    });
    const data = assertEnvelopeData(body, "Guided onboarding");

    coords = {
      defaultTeamId: requireString(data.defaultTeamId, "onboarding defaultTeamId"),
      environmentId: requireString(
        data.developmentEnvironmentId,
        "onboarding developmentEnvironmentId",
      ),
      organizationId: requireString(data.organizationId, "onboarding organizationId"),
      ownerMembershipId: requireString(data.ownerMembershipId, "onboarding ownerMembershipId"),
      projectId: requireString(data.projectId, "onboarding projectId"),
    };
  });

  await test.step("secrets.write", async () => {
    const body = await postJson({
      bearer: ownerBearer,
      body: { organizationId: coords.organizationId, value: sentinel.value, variableKey },
      label: "Secret write",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${coords.environmentId}/secrets/by-variable-key`,
    });
    const data = assertEnvelopeData(body, "Secret write");

    secretId = requireString(data.secretId, "secret write secretId");
    requireString(data.secretVersionId, "secret write secretVersionId");
  });

  await test.step("runtime_injection.grant_issue", async () => {
    const body = await postJson({
      bearer: ownerBearer,
      body: {
        environmentId: coords.environmentId,
        organizationId: coords.organizationId,
        projectId: coords.projectId,
        variableKey,
      },
      label: "Grant issue",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/runtime-injection/grants`,
    });
    const data = assertEnvelopeData(body, "Grant issue");

    grantId = requireString(data.grantId, "grant issue grantId");
  });

  await test.step("runtime_injection.grant_consume", async () => {
    const body = await postJson({
      bearer: ownerBearer,
      body: { organizationId: coords.organizationId, variableKey },
      label: "Grant consume",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/runtime-injection/grants/${grantId}/consume`,
    });
    assertEqual(body.ok, true, "Grant consume ok");

    const delivery = asRecord(body.delivery, "grant consume delivery");
    const encoded = requireString(delivery.encodedValueUtf8, "grant consume encoded value");
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    if (decoded !== sentinel.value) {
      throw new Error("Grant consume did not return the generated sentinel value.");
    }
  });

  await test.step("runtime_injection.grant_replay_reject", async () => {
    const response = await fetch(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/runtime-injection/grants/${grantId}/consume`,
      {
        body: JSON.stringify({ organizationId: coords.organizationId, variableKey }),
        headers: { ...authHeaders(ownerBearer), "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const text = await response.text();
    if (response.ok) {
      throw new Error("Grant replay unexpectedly succeeded.");
    }
    assertStatus(response, 404, "Grant replay", { bodyText: text, redactor });
    const body = await readJsonResponse(response, "Grant replay", text);
    assertEnvelopeError(body, INJECTION_ERROR_CODES.grantDenied, "Grant replay");
  });

  await test.step("organizations.create", async () => {
    const body = await postJson({
      bearer: ownerBearer,
      body: { organizationDisplayName: `Smoke operator org ${String(Date.now())}` },
      label: "Organization create",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/organizations`,
    });
    const data = assertEnvelopeData(body, "Organization create");

    secondaryOrganizationId = requireString(
      data.organizationId,
      "organization create organizationId",
    );
    requireString(data.defaultTeamId, "organization create defaultTeamId");
  });

  await test.step("operations.setup_protected_handoff", async () => {
    const protectedEnvironmentId = mintProtectedEnvironmentId();
    const policyId = mintRunPolicyId();

    await provisionProtectedSmokeEnvironment({
      databaseUrl: preview.databaseUrl,
      environmentId: protectedEnvironmentId,
      organizationId: coords.organizationId,
      projectId: coords.projectId,
    });

    operationId = await requestRunPolicyOperationHandoff({
      apiBaseUrl: preview.apiBaseUrl,
      bearer: ownerBearer,
      environmentId: protectedEnvironmentId,
      organizationId: coords.organizationId,
      policyId,
      projectId: coords.projectId,
      redactor,
      secretId,
    });
  });

  await test.step("operations.poll", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/operations/${operationId}`,
      "Operation poll",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    const data = assertEnvelopeData(body, "Operation poll");
    assertOperationPollEnvelope({
      data,
      operationId,
      organizationId: coords.organizationId,
      redactor,
    });

    await assertCrossOrganizationOperationPollDenied({
      apiBaseUrl: preview.apiBaseUrl,
      bearer: ownerBearer,
      operationId,
      otherOrganizationId: secondaryOrganizationId,
      redactor,
    });
  });

  await test.step("invitations.create", async () => {
    invitation = invitationId.generate();
    const body = await postJson({
      bearer: ownerBearer,
      body: {
        invitationId: invitation,
        inviteeUserId: preview.inviteeUserId,
        projectId: coords.projectId,
        rolePreset: "developer",
      },
      label: "Invitation create",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/invitations`,
    });
    const data = assertEnvelopeData(body, "Invitation create");
    assertEqual(data.invitationId, invitation, "Invitation create invitationId");
  });

  await test.step("invitations.accept", async () => {
    const membership = membershipId.generate();
    const body = await postJson({
      bearer: inviteeBearer,
      body: { membershipId: membership },
      label: "Invitation accept",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/invitations/${invitation}/accept`,
    });
    const data = assertEnvelopeData(body, "Invitation accept");

    assertEqual(data.invitationId, invitation, "Invitation accept invitationId");
    requireString(data.membershipId, "invitation accept membershipId");
  });

  await test.step("design_partner_feedback.submit", async () => {
    const body = await postJson({
      bearer: ownerBearer,
      body: {
        feedbackKind: "feedback.kind.praise",
        grantId,
        noteCode: "feedback.note.praise_loop",
      },
      label: "Design-partner feedback",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/design-partner-feedback`,
    });
    const data = assertEnvelopeData(body, "Design-partner feedback");

    feedbackId = requireString(data.feedbackId, "design partner feedback feedbackId");
  });

  await test.step("audit_events.verify_first_value_evidence", async () => {
    const auditEvidence = await verifyFirstValueAuditEvidence({
      databaseUrl: preview.databaseUrl,
      feedbackId,
      grantId,
      operationId,
      organizationId: coords.organizationId,
      redactor,
    });
    annotateVerifiedAuditEventCodes(
      (annotation) => test.info().annotations.push(annotation),
      auditEvidence,
    );
    if (!auditEvidence.feedbackPresent) {
      throw new Error("Expected design-partner feedback evidence in first_value_feedback.");
    }
  });

  await test.step("plaintext_sweep.postgres", async () => {
    const sweep = await runPlaintextSweep(preview.databaseUrl, sentinel);
    if (sweep.hits.length > 0) {
      throw new Error(
        `Plaintext sweep found ${String(sweep.hits.length)} sentinel hit(s): ${JSON.stringify(sweep.hits)}`,
      );
    }
  });
});
