import { AUTH_ERROR_CODES, environmentId } from "@insecur/domain";

import {
  assertDeniedBodyFreeOfSensitiveValues,
  assertEnvelopeData,
  assertEnvelopeError,
  assertEqual,
  assertPostDeniedInsufficientScope,
  assertStatus,
  asRecord,
  authHeaders,
  mintSmokeSentinel,
  NEGATIVE_PROBE_DENIED_AUDIT_EXPECTATIONS,
  postJson,
  probeMetadataReadDenials,
  probeSessionMembershipsNoScopeIsolation,
  readJsonResponse,
  redactorFor,
  requireString,
  test,
  verifyDeniedAuditEvidence,
} from "../src/fixtures";

const NONEXISTENT_ENVIRONMENT_ID = environmentId.brand("env_00000000000000000000NEXST9");

test.describe("preview negative authorization probes @preview @negative @custody", () => {
  test("no-scope actor is denied insufficient_scope on secret write and runtime injection grant", async ({
    noScopeBearer,
    ownerBearer,
    preview,
  }) => {
    test.setTimeout(180_000);

    const sentinel = mintSmokeSentinel();
    const redactor = redactorFor(preview, sentinel, [ownerBearer, noScopeBearer]);
    const variableKey = `SMOKE_PROBE_${String(Date.now())}`;

    const coords = await test.step("onboarding.personal_organization", async () => {
      const body = await postJson({
        bearer: ownerBearer,
        body: {},
        label: "Guided onboarding",
        redactor,
        url: `${preview.apiBaseUrl}/v1/onboarding/personal-organization`,
      });
      const data = assertEnvelopeData(body, "Guided onboarding");

      return {
        environmentId: requireString(
          data.developmentEnvironmentId,
          "onboarding developmentEnvironmentId",
        ),
        organizationId: requireString(data.organizationId, "onboarding organizationId"),
        projectId: requireString(data.projectId, "onboarding projectId"),
      };
    });

    await test.step("secrets.write.no_scope_denied", async () => {
      await assertPostDeniedInsufficientScope({
        bearer: noScopeBearer,
        body: {
          organizationId: coords.organizationId,
          value: sentinel.value,
          variableKey,
        },
        label: "No-scope secret write",
        redactor,
        url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${coords.environmentId}/secrets/by-variable-key`,
      });
    });

    await test.step("runtime_injection.grant_issue.no_scope_denied", async () => {
      await assertPostDeniedInsufficientScope({
        bearer: noScopeBearer,
        body: {
          environmentId: coords.environmentId,
          organizationId: coords.organizationId,
          projectId: coords.projectId,
          variableKey,
        },
        label: "No-scope grant issue",
        redactor,
        url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/runtime-injection/grants`,
      });
    });

    await test.step("audit_events.verify_denied_evidence", async () => {
      const auditEvidence = await verifyDeniedAuditEvidence({
        databaseUrl: preview.databaseUrl,
        expectations: NEGATIVE_PROBE_DENIED_AUDIT_EXPECTATIONS,
        organizationId: coords.organizationId,
        redactor,
      });
      pushVerifiedAuditAnnotation(test.info(), auditEvidence.verifiedDeniedEventCodes);
    });
  });

  test("no-scope actor is denied insufficient_scope on authenticated metadata reads", async ({
    noScopeBearer,
    ownerBearer,
    preview,
  }) => {
    test.setTimeout(180_000);

    const sentinel = mintSmokeSentinel();
    const redactor = redactorFor(preview, sentinel, [ownerBearer, noScopeBearer]);

    const coords = await test.step("onboarding.personal_organization", async () => {
      const body = await postJson({
        bearer: ownerBearer,
        body: {},
        label: "Guided onboarding",
        redactor,
        url: `${preview.apiBaseUrl}/v1/onboarding/personal-organization`,
      });
      const data = assertEnvelopeData(body, "Guided onboarding");

      return {
        environmentId: requireString(
          data.developmentEnvironmentId,
          "onboarding developmentEnvironmentId",
        ),
        organizationId: requireString(data.organizationId, "onboarding organizationId"),
        projectId: requireString(data.projectId, "onboarding projectId"),
      };
    });

    await test.step("session.memberships.no_scope_isolation", async () => {
      await probeSessionMembershipsNoScopeIsolation({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: noScopeBearer,
        preview,
        redactor,
        seededOrganizationId: coords.organizationId,
      });
    });

    await test.step("metadata_reads.no_scope_denied", async () => {
      await probeMetadataReadDenials({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: noScopeBearer,
        coords,
        redactor,
      });
    });
  });

  test("secret write is not a coordinate existence oracle for no-scope actor", async ({
    noScopeBearer,
    ownerBearer,
    preview,
  }) => {
    test.setTimeout(180_000);

    const sentinel = mintSmokeSentinel();
    const redactor = redactorFor(preview, sentinel, [ownerBearer, noScopeBearer]);
    const variableKey = `SMOKE_ORACLE_${String(Date.now())}`;

    const coords = await test.step("onboarding.personal_organization", async () => {
      const body = await postJson({
        bearer: ownerBearer,
        body: {},
        label: "Guided onboarding",
        redactor,
        url: `${preview.apiBaseUrl}/v1/onboarding/personal-organization`,
      });
      const data = assertEnvelopeData(body, "Guided onboarding");

      return {
        environmentId: requireString(
          data.developmentEnvironmentId,
          "onboarding developmentEnvironmentId",
        ),
        organizationId: requireString(data.organizationId, "onboarding organizationId"),
        projectId: requireString(data.projectId, "onboarding projectId"),
      };
    });

    const validCoordinate = `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${coords.environmentId}/secrets/by-variable-key`;
    const nonexistentCoordinate = `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${NONEXISTENT_ENVIRONMENT_ID}/secrets/by-variable-key`;
    const body = JSON.stringify({
      organizationId: coords.organizationId,
      value: sentinel.value,
      variableKey,
    });

    const responses = await Promise.all(
      [validCoordinate, nonexistentCoordinate].map((url) =>
        fetch(url, {
          body,
          headers: { ...authHeaders(noScopeBearer), "Content-Type": "application/json" },
          method: "POST",
        }),
      ),
    );

    const outcomes = await Promise.all(
      responses.map(async (response, index) => {
        const text = await response.text();
        const label = index === 0 ? "Valid coordinate" : "Nonexistent coordinate";
        assertStatus(response, 403, label, { bodyText: text, redactor });
        const json = await readJsonResponse(response, label, text);
        assertEnvelopeError(json, AUTH_ERROR_CODES.insufficientScope, label);
        assertDeniedBodyFreeOfSensitiveValues(text, redactor, label);
        return {
          code: requireString(asRecord(json.error, `${label} error`).code, `${label} error code`),
          status: response.status,
        };
      }),
    );

    assertEqual(outcomes[0]?.status, outcomes[1]?.status, "Coordinate oracle HTTP status");
    assertEqual(outcomes[0]?.code, outcomes[1]?.code, "Coordinate oracle error code");
  });
});

function pushVerifiedAuditAnnotation(
  testInfo: { annotations: { push: (annotation: { description: string; type: string }) => void } },
  verifiedDeniedEventCodes: string[],
): void {
  testInfo.annotations.push({
    description: verifiedDeniedEventCodes.join(", "),
    type: "audit.verified_event_codes",
  });
}
