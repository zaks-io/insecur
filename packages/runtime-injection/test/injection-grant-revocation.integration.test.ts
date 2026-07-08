import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  INJECTION_ERROR_CODES,
  parseDisplayName,
  runtimePolicyId,
  runtimePolicyVersionId,
  type VariableKey,
} from "@insecur/domain";
import { InjectionGrantError } from "../src/injection-grant-error.js";
import { RUNTIME_INJECTION_DELIVERY_MODES, withTenantScope } from "@insecur/tenant-store";
import { expect, it } from "vitest";
import {
  createTestKeyring,
  uniqueVariableKey,
  writeTestSecret,
} from "../../secret-store/test/integration-helpers.js";
import {
  createAuthorizedRuntimeInjectionPolicy,
  publishAuthorizedRuntimeInjectionPolicyVersion,
} from "../src/runtime-injection-policies.js";
import { consumeInjectionGrant, issueInjectionGrant } from "../src/injection-grants.js";
import {
  revokeInjectionGrantsForCompromiseVersion,
  revokeInjectionGrantsForTenantSuspension,
} from "../src/revoke-injection-grants.js";
import {
  describeInjectionGrantIntegration,
  loadAuditRow,
  loadGrantBinding,
} from "./injection-grant-integration-helpers.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

const POLICY_ID = "rp_00000000000000000000000021";
const VERSION_ONE_ID = "rpv_00000000000000000000000021";
const VERSION_TWO_ID = "rpv_00000000000000000000000022";

function displayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function loadGrantRevocation(
  organizationId: ReturnType<typeof testOrganization>,
  grantId: string,
) {
  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    const rows = await sql<{ revoked_at: string | null; revoked_reason: string | null }[]>`
      SELECT revoked_at, revoked_reason
      FROM injection_grants
      WHERE id = ${grantId}
      LIMIT 1
    `;
    return rows[0];
  });
}

describeInjectionGrantIntegration("Runtime Injection Grant revocation (ADR-0074)", () => {
  it("denies consume after tenant suspension revokes active grants", async () => {
    const org = testOrganization();
    const variableKey: VariableKey = uniqueVariableKey("INS449_SUSPEND");
    const plaintext = new TextEncoder().encode(`suspend-${crypto.randomUUID()}`);
    await writeTestSecret(variableKey, plaintext);

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    const revoked = await revokeInjectionGrantsForTenantSuspension({
      organizationId: org,
      actor: testActor(),
    });
    expect(revoked.revokedGrantIds).toContain(issued.grantId);

    const marker = await loadGrantRevocation(org, issued.grantId);
    expect(marker?.revoked_at).not.toBeNull();
    expect(marker?.revoked_reason).toBe("tenant_suspension");

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: issued.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toBeInstanceOf(InjectionGrantError);

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: issued.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const auditEventId = revoked.auditEventId;
    if (auditEventId === undefined) {
      throw new Error("expected tenant suspension revocation audit event id");
    }
    const audit = await loadAuditRow(org, auditEventId);
    expect(audit?.event_code).toBe(
      FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantsRevokedTenantSuspension,
    );
    expect(audit?.details).toMatchObject({ revokedGrantCount: expect.any(Number) });
  });

  it("revokes only grants bound to the invalidated secret version", async () => {
    const org = testOrganization();
    const variableKey: VariableKey = uniqueVariableKey("INS449_COMPROMISE");
    const firstValue = new TextEncoder().encode(`compromise-first-${crypto.randomUUID()}`);
    const secondValue = new TextEncoder().encode(`compromise-second-${crypto.randomUUID()}`);

    const firstWrite = await writeTestSecret(variableKey, firstValue);
    const revokedGrant = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    const secondWrite = await writeTestSecret(variableKey, secondValue);
    const survivingGrant = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    const storedRevoked = await loadGrantBinding(org, revokedGrant.grantId);
    expect(storedRevoked?.secret_version_ids[0]).toBe(firstWrite.secretVersionId);
    const storedSurviving = await loadGrantBinding(org, survivingGrant.grantId);
    expect(storedSurviving?.secret_version_ids[0]).toBe(secondWrite.secretVersionId);

    const result = await revokeInjectionGrantsForCompromiseVersion({
      organizationId: org,
      secretVersionId: firstWrite.secretVersionId,
      actor: testActor(),
    });
    expect(result.revokedGrantIds).toContain(revokedGrant.grantId);
    expect(result.revokedGrantIds).not.toContain(survivingGrant.grantId);

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: revokedGrant.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const consumed = await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: survivingGrant.grantId,
      variableKey,
      actor: testActor(),
    });
    expect(consumed.secretVersionId).toBe(secondWrite.secretVersionId);

    const auditEventId = result.auditEventId;
    if (auditEventId === undefined) {
      throw new Error("expected compromise revocation audit event id");
    }
    const audit = await loadAuditRow(org, auditEventId);
    expect(audit?.event_code).toBe(
      FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantsRevokedCompromiseVersion,
    );
  });

  it("keeps revoked grants terminal after reinstatement and allows fresh grants", async () => {
    const org = testOrganization();
    const variableKey: VariableKey = uniqueVariableKey("INS449_REINSTATE");
    const revokedPlaintext = new TextEncoder().encode(`reinstate-revoked-${crypto.randomUUID()}`);
    const freshPlaintext = new TextEncoder().encode(`reinstate-fresh-${crypto.randomUUID()}`);
    await writeTestSecret(variableKey, revokedPlaintext);

    const revokedGrant = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    await revokeInjectionGrantsForTenantSuspension({
      organizationId: org,
      actor: testActor(),
    });

    const revokedMarker = await loadGrantRevocation(org, revokedGrant.grantId);
    expect(revokedMarker?.revoked_at).not.toBeNull();

    const freshWrite = await writeTestSecret(variableKey, freshPlaintext);
    const freshGrant = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    expect(freshGrant.grantId).not.toBe(revokedGrant.grantId);
    const freshBinding = await loadGrantBinding(org, freshGrant.grantId);
    expect(freshBinding?.secret_version_ids[0]).toBe(freshWrite.secretVersionId);
    expect(await loadGrantRevocation(org, revokedGrant.grantId)).toMatchObject({
      revoked_at: expect.any(String),
      revoked_reason: "tenant_suspension",
    });

    await expect(
      consumeInjectionGrant({
        keyring: createTestKeyring(),
        organizationId: org,
        grantId: revokedGrant.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const consumed = await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: freshGrant.grantId,
      variableKey,
      actor: testActor(),
    });
    expect(new TextDecoder().decode(consumed.valueUtf8.unwrapUtf8())).toBe(
      new TextDecoder().decode(freshPlaintext),
    );
  });

  it("does not revoke in-flight grants when the runtime injection policy version changes", async () => {
    const org = testOrganization();
    const project = testProject();
    const environment = testEnvironment();
    const actor = testActor();
    const variableKey: VariableKey = uniqueVariableKey("INS449_POLICY");
    const plaintext = new TextEncoder().encode(`policy-grant-${crypto.randomUUID()}`);
    const written = await writeTestSecret(variableKey, plaintext);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`UPDATE runtime_injection_policies SET active_version_id = NULL WHERE id = ${POLICY_ID}`;
      await sql`DELETE FROM runtime_injection_policy_versions WHERE policy_id = ${POLICY_ID}`;
      await sql`DELETE FROM runtime_injection_policies WHERE id = ${POLICY_ID}`;
    });

    const accessCoordinate = {
      organizationId: org,
      projectId: project,
      environmentId: environment,
    };
    const { resolveEffectiveAccess } = await import("@insecur/access");
    const ownerAccess = await resolveEffectiveAccess(actor, accessCoordinate);

    await createAuthorizedRuntimeInjectionPolicy({
      ...accessCoordinate,
      policyId: runtimePolicyId.brand(POLICY_ID),
      policyVersionId: runtimePolicyVersionId.brand(VERSION_ONE_ID),
      displayName: displayName("INS449 Policy"),
      version: {
        secretIds: [written.secretId],
        variableKeys: [],
        command: "npm test",
        ttlSeconds: 300,
        deliveryMode: RUNTIME_INJECTION_DELIVERY_MODES.environmentVariables,
      },
      effectiveAccess: ownerAccess,
      accessCoordinate,
    });

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: project,
      environmentId: environment,
      selector: { kind: "policy_id", policyId: runtimePolicyId.brand(POLICY_ID) },
      actor,
    });

    await publishAuthorizedRuntimeInjectionPolicyVersion({
      ...accessCoordinate,
      policyId: runtimePolicyId.brand(POLICY_ID),
      policyVersionId: runtimePolicyVersionId.brand(VERSION_TWO_ID),
      displayName: displayName("INS449 Policy v2"),
      version: {
        secretIds: [written.secretId],
        variableKeys: [],
        command: "npm run build",
        ttlSeconds: 300,
        deliveryMode: RUNTIME_INJECTION_DELIVERY_MODES.environmentVariables,
      },
      effectiveAccess: ownerAccess,
      accessCoordinate,
    });

    const marker = await loadGrantRevocation(org, issued.grantId);
    expect(marker?.revoked_at).toBeNull();

    const consumed = await consumeInjectionGrant({
      keyring: createTestKeyring(),
      organizationId: org,
      grantId: issued.grantId,
      secretId: written.secretId,
      actor,
    });
    expect(consumed.secretVersionId).toBe(written.secretVersionId);
  });
});
