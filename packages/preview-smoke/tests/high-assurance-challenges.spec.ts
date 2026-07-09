import {
  auditEventId,
  generateOpaqueResourceIdForPrefix,
  operationId,
  userId,
} from "@insecur/domain";

import { loadOrganizationAuditEvents, withServiceRoleSql } from "../src/audit-verification-db";
import {
  assertHtmlFreeOfSensitiveMaterial,
  gotoAuthedWebPage,
  useSmokeBearer,
} from "../src/web-console";
import {
  asRecord,
  assertEnvelopeData,
  assertEqual,
  assertGetDeniedInsufficientScope,
  assertPostDeniedInsufficientScope,
  assertResponseFreeOfRedactedPatterns,
  authHeaders,
  getJson,
  mintSmokeSentinel,
  postJson,
  provisionFirstValueCoords,
  redactorFor,
  requireString,
  seedSmokeHighAssuranceChallenge,
  test,
  type JsonRecord,
} from "../src/fixtures";

/**
 * Preview smoke coverage for the High-Assurance Challenge review lifecycle (INS-361, INS-508).
 *
 * No smoke-reachable HTTP route can mint a real pending challenge: the public environment-create
 * route never creates a Protected Environment (the sole trigger for
 * `gateProtectedRuntimeInjectionPolicyChange`), so this test seeds one directly via service-role SQL
 * (`seedSmokeHighAssuranceChallenge`, mirroring the INS-358 operation-poll harness) and then drives
 * the shipped list / evidence-get / deny routes against it on live preview. The `clear` step-up leg
 * and the non-human/machine-actor 401 path are explicitly out of reach here and are annotated below,
 * not faked.
 */
test.describe("preview high-assurance challenge review lifecycle @preview @happy-path @high-assurance", () => {
  test("list, evidence-get, and deny are metadata-only and audited", async ({
    noScopeBearer,
    ownerBearer,
    preview,
  }) => {
    test.setTimeout(180_000);

    const sentinel = mintSmokeSentinel();
    const redactor = redactorFor(preview, sentinel, [ownerBearer, noScopeBearer]);
    const variableKey = `SMOKE_HAC_${String(Date.now())}`;

    const coords = await test.step("provision.first_value", async () =>
      provisionFirstValueCoords({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        redactor,
        sentinel,
        variableKey,
      }));

    const seededOperationId = operationId.generate();
    const seededChallengeId = generateOpaqueResourceIdForPrefix("chlg");
    const seededRequestAuditEventId = auditEventId.generate();
    const ownerUserId = userId.brand(preview.ownerUserId);

    await test.step("high_assurance.seed_pending_challenge", async () => {
      await seedSmokeHighAssuranceChallenge({
        challengeId: seededChallengeId,
        databaseUrl: preview.databaseUrl,
        environmentId: coords.environmentId,
        operationId: seededOperationId,
        organizationId: coords.organizationId,
        projectId: coords.projectId,
        requestAuditEventId: seededRequestAuditEventId,
        requestingUserId: ownerUserId,
      });
    });

    const listUrl = `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/high-assurance-challenges`;
    const detailUrl = `${listUrl}/${seededOperationId}`;
    const denyUrl = `${detailUrl}/deny`;

    await test.step("high_assurance.list_pending", async () => {
      const body = await getJson(
        listUrl,
        "High-assurance list",
        { headers: authHeaders(ownerBearer) },
        redactor,
      );
      assertResponseFreeOfRedactedPatterns(redactor, body, "High-assurance list");
      const data = assertEnvelopeData(body, "High-assurance list");
      const challenges = requireChallengeArray(data.challenges, "High-assurance list challenges");
      const seeded = findChallenge(challenges, seededOperationId, "High-assurance list");

      assertEqual(seeded.challengeId, seededChallengeId, "High-assurance list challengeId");
      assertEqual(seeded.projectId, coords.projectId, "High-assurance list projectId");
      assertEqual(seeded.status, "pending", "High-assurance list status");
      assertEqual(seeded.requestingUserId, ownerUserId, "High-assurance list requestingUserId");
      requireString(seeded.riskReasonCode, "High-assurance list riskReasonCode");
      requireString(seeded.requestedAt, "High-assurance list requestedAt");
      requireString(seeded.expiresAt, "High-assurance list expiresAt");
      assertNoSecretAdjacentKeys(seeded, "High-assurance list challenge");
    });

    await test.step("high_assurance.evidence_get", async () => {
      const body = await getJson(
        detailUrl,
        "High-assurance evidence get",
        { headers: authHeaders(ownerBearer) },
        redactor,
      );
      assertResponseFreeOfRedactedPatterns(redactor, body, "High-assurance evidence get");
      const data = assertEnvelopeData(body, "High-assurance evidence get");
      const challenge = asRecord(data.challenge, "High-assurance evidence get challenge");

      assertEqual(
        challenge.operationId,
        seededOperationId,
        "High-assurance evidence get operationId",
      );
      assertEqual(
        challenge.challengeId,
        seededChallengeId,
        "High-assurance evidence get challengeId",
      );
      assertEqual(challenge.projectId, coords.projectId, "High-assurance evidence get projectId");
      assertEqual(
        challenge.requestingUserId,
        ownerUserId,
        "High-assurance evidence get requestingUserId",
      );
      assertEqual(challenge.status, "pending", "High-assurance evidence get status");
      assertEqual(
        challenge.hasClearedEvidence,
        false,
        "High-assurance evidence get hasClearedEvidence",
      );
      requireString(challenge.riskReasonCode, "High-assurance evidence get riskReasonCode");
      requireString(challenge.intentCode, "High-assurance evidence get intentCode");
      assertNoSecretAdjacentKeys(challenge, "High-assurance evidence get challenge");
    });

    await test.step("high_assurance.no_scope_actor_denied_on_list_and_get", async () => {
      await assertGetDeniedInsufficientScope({
        bearer: noScopeBearer,
        label: "High-assurance list (no-scope actor)",
        redactor,
        url: listUrl,
      });
      // A no-scope actor has zero organization membership, so the human-review membership gate
      // (assertHumanReviewActor) throws insufficientScope -> 403 before any resource lookup or scope
      // masking. ADR-0062 oracle-safe 404-masking is a distinct, narrower case: it applies to an
      // actor who HAS membership but LACKS approval scope at the challenge's project/environment
      // coordinate. That coordinate-masking path is not reachable from this out-of-org actor and is
      // covered by unit/integration tests in packages/high-assurance and apps/api.
      await assertGetDeniedInsufficientScope({
        bearer: noScopeBearer,
        label: "High-assurance evidence get (no-scope actor)",
        redactor,
        url: detailUrl,
      });
    });

    await test.step("high_assurance.no_scope_actor_denied_on_deny", async () => {
      await assertPostDeniedInsufficientScope({
        bearer: noScopeBearer,
        body: {},
        label: "High-assurance deny (no-scope actor)",
        redactor,
        url: denyUrl,
      });
    });

    await test.step("high_assurance.deny", async () => {
      const body = await postJson({
        bearer: ownerBearer,
        body: {},
        label: "High-assurance deny",
        redactor,
        url: denyUrl,
      });
      assertResponseFreeOfRedactedPatterns(redactor, body, "High-assurance deny");
      const data = assertEnvelopeData(body, "High-assurance deny");
      assertEqual(data.operationId, seededOperationId, "High-assurance deny operationId");
      assertEqual(data.challengeId, seededChallengeId, "High-assurance deny challengeId");
      assertEqual(data.state, "canceled", "High-assurance deny state");
    });

    await test.step("high_assurance.deny_removes_from_pending_list", async () => {
      const body = await getJson(
        listUrl,
        "High-assurance list (post-deny)",
        { headers: authHeaders(ownerBearer) },
        redactor,
      );
      const data = assertEnvelopeData(body, "High-assurance list (post-deny)");
      const challenges = requireChallengeArray(
        data.challenges,
        "High-assurance list (post-deny) challenges",
      );
      const stillPending = includesOperationId(challenges, seededOperationId);
      assertEqual(stillPending, false, "High-assurance list (post-deny) no longer includes denial");
    });

    await test.step("high_assurance.deny_audit_recorded", async () => {
      await assertDenyAuditRecorded({
        databaseUrl: preview.databaseUrl,
        operationId: seededOperationId,
        organizationId: coords.organizationId,
        redactor,
      });
    });

    test.info().annotations.push({
      description:
        "POST .../clear (step-up) is not exercised: it requires a real WorkOS browser MFA " +
        "exchange (freshStepUpFactor server-verified via stepUpCode/stepUpCodeVerifier), which " +
        "cannot be automated headless. Covered by unit/integration tests in apps/api and " +
        "packages/high-assurance instead.",
      type: "high_assurance.clear_not_exercised",
    });
    test.info().annotations.push({
      description:
        "The true non-human/machine-actor 401 (auth.invalid) rejection on these routes is not " +
        "exercisable from preview-smoke: minting a machine access token requires " +
        "MACHINE_ACCESS_SIGNING_SECRET, which is not wired into preview-smoke's CI environment. " +
        "The no-scope *human* actor path above exercises the reachable half of this acceptance " +
        "criterion (insufficient_scope 403 on list, evidence-get, and deny). The machine-actor " +
        "401 path is covered " +
        "by apps/api/src/routes/v1/high-assurance-challenges-routes.test.ts.",
      type: "high_assurance.non_human_actor_not_exercised",
    });
  });

  test("web approvals inbox and detail page render metadata only", async ({
    ownerBearer,
    page,
    preview,
  }) => {
    test.setTimeout(120_000);

    const sentinel = mintSmokeSentinel();
    const redactor = redactorFor(preview, sentinel, [ownerBearer]);
    const variableKey = `SMOKE_HAC_WEB_${String(Date.now())}`;

    const coords = await test.step("provision.first_value", async () =>
      provisionFirstValueCoords({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        redactor,
        sentinel,
        variableKey,
      }));

    const seededOperationId = operationId.generate();
    const seededChallengeId = generateOpaqueResourceIdForPrefix("chlg");
    const seededRequestAuditEventId = auditEventId.generate();
    const ownerUserId = userId.brand(preview.ownerUserId);

    await test.step("high_assurance.seed_pending_challenge", async () => {
      await seedSmokeHighAssuranceChallenge({
        challengeId: seededChallengeId,
        databaseUrl: preview.databaseUrl,
        environmentId: coords.environmentId,
        operationId: seededOperationId,
        organizationId: coords.organizationId,
        projectId: coords.projectId,
        requestAuditEventId: seededRequestAuditEventId,
        requestingUserId: ownerUserId,
      });
    });

    await useSmokeBearer(page, ownerBearer);

    await test.step("web.approvals_inbox", async () => {
      await gotoAuthedWebPage(page, preview.webBaseUrl, `/orgs/${coords.organizationId}/approvals`);
      const html = await page.content();
      assertHtmlFreeOfSensitiveMaterial(html, "Web /approvals", [
        ownerBearer,
        preview.signingSecret,
      ]);
      if (!html.includes(seededOperationId)) {
        throw new Error("Web /approvals did not render the seeded pending challenge.");
      }
    });

    await test.step("web.approvals_detail", async () => {
      await gotoAuthedWebPage(
        page,
        preview.webBaseUrl,
        `/orgs/${coords.organizationId}/approvals/${seededOperationId}`,
      );
      const html = await page.content();
      assertHtmlFreeOfSensitiveMaterial(html, "Web /approvals/:id", [
        ownerBearer,
        preview.signingSecret,
      ]);
      if (!html.includes(seededOperationId)) {
        throw new Error("Web /approvals/:id did not render the seeded challenge operation ID.");
      }
    });

    // Deny after asserting the pages so the detail route still resolves the pending challenge.
    await test.step("high_assurance.deny_cleanup", async () => {
      await postJson({
        bearer: ownerBearer,
        body: {},
        label: "High-assurance deny (web test cleanup)",
        redactor,
        url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/high-assurance-challenges/${seededOperationId}/deny`,
      });
    });
  });
});

interface AssertDenyAuditRecordedInput {
  databaseUrl: string;
  operationId: string;
  organizationId: string;
  redactor: (value: unknown) => string;
}

async function assertDenyAuditRecorded(input: AssertDenyAuditRecordedInput): Promise<void> {
  await withServiceRoleSql(input.databaseUrl, (sql) =>
    verifyDenyAuditRow(sql, input.organizationId, input.operationId, input.redactor),
  );
}

async function verifyDenyAuditRow(
  sql: Parameters<typeof loadOrganizationAuditEvents>[0],
  organizationId: string,
  operationId: string,
  redactor: (value: unknown) => string,
): Promise<void> {
  const auditRows = await loadOrganizationAuditEvents(sql, organizationId);
  const denyEvent = auditRows.find(
    (row) => row.eventCode === "high_assurance.challenge_denied" && row.operationId === operationId,
  );
  if (denyEvent === undefined) {
    throw new Error(
      `Expected a high_assurance.challenge_denied audit event for operation ${operationId}.`,
    );
  }
  assertEqual(denyEvent.outcome, "success", "High-assurance deny audit outcome");
  assertResponseFreeOfRedactedPatterns(redactor, denyEvent, "High-assurance deny audit event");
}

function includesOperationId(rows: readonly JsonRecord[], expectedOperationId: string): boolean {
  return rows.some((row) => row.operationId === expectedOperationId);
}

function requireChallengeArray(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => asRecord(item, `${label}[${String(index)}]`));
}

function findChallenge(
  rows: readonly JsonRecord[],
  expectedOperationId: string,
  label: string,
): JsonRecord {
  const match = rows.find((row) => row.operationId === expectedOperationId);
  if (match === undefined) {
    throw new Error(`${label} did not include operationId ${expectedOperationId}.`);
  }
  return match;
}

const SECRET_ADJACENT_KEY_PATTERN = /value|plaintext|password|secret_value|token(?!Id)/iu;

function assertNoSecretAdjacentKeys(record: JsonRecord, label: string): void {
  for (const key of Object.keys(record)) {
    if (SECRET_ADJACENT_KEY_PATTERN.test(key)) {
      throw new Error(`${label} unexpectedly carried a secret-adjacent key: ${key}`);
    }
  }
}
