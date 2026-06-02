import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import { configureKeyring, createKeyring, resetKeyringForTests } from "@insecur/crypto";
import {
  brandOpaqueResourceIdForPrefix,
  environmentId,
  injectionGrantId,
  INJECTION_ERROR_CODES,
  projectId,
  secretId,
  type VariableKey,
} from "@insecur/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_ENV_B_ID, TEST_PROJECT_B_ID } from "../../tenant-store/test/rls/test-ids.js";
import { uniqueVariableKey, writeTestSecret } from "../../secrets/test/integration-helpers.js";

import { InjectionGrantError } from "../src/injection-grant-error.js";
import { consumeInjectionGrant, issueInjectionGrant } from "../src/injection-grants.js";
import {
  testActor,
  testEnvironment,
  testOrganization,
  testProject,
} from "./integration-helpers.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

async function loadLatestIssueDeniedAudit(organizationId: ReturnType<typeof testOrganization>) {
  return withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    const rows = await sql<
      {
        event_code: string;
        outcome: string;
        result_code: string | null;
      }[]
    >`
      SELECT event_code, outcome, result_code
      FROM audit_events
      WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0];
  });
}

async function loadAuditRow(
  organizationId: ReturnType<typeof testOrganization>,
  auditEventId: string,
) {
  return withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    const rows = await sql<
      {
        event_code: string;
        outcome: string;
        result_code: string | null;
        resource_id: string | null;
      }[]
    >`
      SELECT event_code, outcome, result_code, resource_id
      FROM audit_events
      WHERE id = ${auditEventId}
      LIMIT 1
    `;
    return rows[0];
  });
}

async function loadGrantBinding(
  organizationId: ReturnType<typeof testOrganization>,
  grantId: string,
) {
  return withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    const rows = await sql<
      { secret_ids: string[]; secret_version_id: string | null; variable_keys: string[] }[]
    >`
      SELECT secret_ids, secret_version_id, variable_keys
      FROM injection_grants
      WHERE id = ${grantId}
      LIMIT 1
    `;
    return rows[0];
  });
}

describeIntegration("Runtime Injection Grant Service", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  beforeEach(() => {
    resetKeyringForTests();
    configureKeyring(createKeyring(createTestRootKey()));
  });

  afterEach(() => {
    resetKeyringForTests();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("issues a fresh grant and consumes it once with metadata-only surfaces", async () => {
    const org = testOrganization();
    const plaintext = new TextEncoder().encode(`fv11-${crypto.randomUUID()}`);
    const variableKey: VariableKey = uniqueVariableKey("FV11_GRANT");
    const written = await writeTestSecret(variableKey, plaintext);

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    expect(issued.grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(issued.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);
    expect(JSON.stringify(issued)).not.toContain(new TextDecoder().decode(plaintext));

    const stored = await loadGrantBinding(org, issued.grantId);
    expect(stored?.secret_ids).toEqual([written.secretId]);
    expect(stored?.secret_version_id).toBe(written.secretVersionId);
    expect(stored?.variable_keys).toEqual([variableKey]);

    const issueAuditEventId = issued.auditEventId;
    if (issueAuditEventId === undefined) {
      throw new Error("expected issue audit event id");
    }
    const issueAudit = await loadAuditRow(org, issueAuditEventId);
    expect(issueAudit?.event_code).toBe("runtime_injection.grant_issued");
    expect(issueAudit?.resource_id).toBe(brandOpaqueResourceIdForPrefix("igr", issued.grantId));
    expect(JSON.stringify(issueAudit)).not.toContain(new TextDecoder().decode(plaintext));

    const consumed = await consumeInjectionGrant({
      organizationId: org,
      grantId: issued.grantId,
      variableKey,
      actor: testActor(),
    });

    expect(consumed.secretId).toBe(written.secretId);
    expect(consumed.secretVersionId).toBe(written.secretVersionId);
    expect(consumed.variableKey).toBe(variableKey);
    expect(new TextDecoder().decode(consumed.valueUtf8)).toBe(new TextDecoder().decode(plaintext));
    expect(
      JSON.stringify({
        variableKey: consumed.variableKey,
        secretId: consumed.secretId,
        secretVersionId: consumed.secretVersionId,
      }),
    ).not.toContain(new TextDecoder().decode(plaintext));

    await expect(
      consumeInjectionGrant({
        organizationId: org,
        grantId: issued.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const replayAuditRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async (sql) => {
        return sql<{ event_code: string; result_code: string | null }[]>`
        SELECT event_code, result_code
        FROM audit_events
        WHERE resource_id = ${brandOpaqueResourceIdForPrefix("igr", issued.grantId)}
          AND event_code = ${"runtime_injection.grant_consume_denied"}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      },
    );
    expect(replayAuditRows[0]?.event_code).toBe("runtime_injection.grant_consume_denied");
    expect(replayAuditRows[0]?.result_code).toBe(INJECTION_ERROR_CODES.grantDenied);
    expect(JSON.stringify(replayAuditRows)).not.toContain(new TextDecoder().decode(plaintext));
  });

  it("issues and consumes by exact secret id selector", async () => {
    const org = testOrganization();
    const plaintext = new TextEncoder().encode(`fv11-secret-id-${crypto.randomUUID()}`);
    const variableKey = uniqueVariableKey("FV11_SECRET_ID");
    const written = await writeTestSecret(variableKey, plaintext);

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "secret_id", secretId: written.secretId },
      actor: testActor(),
    });

    const stored = await loadGrantBinding(org, issued.grantId);
    expect(stored?.secret_version_id).toBe(written.secretVersionId);

    const consumed = await consumeInjectionGrant({
      organizationId: org,
      grantId: issued.grantId,
      secretId: written.secretId,
      actor: testActor(),
    });

    expect(consumed.secretId).toBe(written.secretId);
    expect(consumed.secretVersionId).toBe(written.secretVersionId);
    expect(consumed.variableKey).toBe(variableKey);
    expect(new TextDecoder().decode(consumed.valueUtf8)).toBe(new TextDecoder().decode(plaintext));
    expect(JSON.stringify(consumed)).not.toContain(new TextDecoder().decode(plaintext));
  });

  it("delivers the secret version bound at issue after rotation", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_ROTATE");
    const firstValue = new TextEncoder().encode(`rotate-first-${crypto.randomUUID()}`);
    const secondValue = new TextEncoder().encode(`rotate-second-${crypto.randomUUID()}`);

    const firstWrite = await writeTestSecret(variableKey, firstValue);
    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    const stored = await loadGrantBinding(org, issued.grantId);
    expect(stored?.secret_version_id).toBe(firstWrite.secretVersionId);

    const secondWrite = await writeTestSecret(variableKey, secondValue);
    expect(secondWrite.secretVersionId).not.toBe(firstWrite.secretVersionId);

    const consumed = await consumeInjectionGrant({
      organizationId: org,
      grantId: issued.grantId,
      variableKey,
      actor: testActor(),
    });

    expect(consumed.secretVersionId).toBe(firstWrite.secretVersionId);
    expect(new TextDecoder().decode(consumed.valueUtf8)).toBe(new TextDecoder().decode(firstValue));
    expect(new TextDecoder().decode(consumed.valueUtf8)).not.toBe(
      new TextDecoder().decode(secondValue),
    );
  });

  it("denies issue with audit when variable key selector does not exist", async () => {
    const org = testOrganization();
    const missingKey: VariableKey = uniqueVariableKey("FV11_MISSING_VK");

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: testEnvironment(),
        selector: { kind: "variable_key", variableKey: missingKey },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const deniedAudit = await loadLatestIssueDeniedAudit(org);
    expect(deniedAudit?.event_code).toBe(FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied);
    expect(deniedAudit?.outcome).toBe("denied");
    expect(deniedAudit?.result_code).toBe(INJECTION_ERROR_CODES.grantDenied);
  });

  it("denies issue with audit when secret id selector does not exist", async () => {
    const org = testOrganization();
    const missingSecretId = secretId.generate();

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: testEnvironment(),
        selector: { kind: "secret_id", secretId: missingSecretId },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    const deniedAudit = await loadLatestIssueDeniedAudit(org);
    expect(deniedAudit?.event_code).toBe(FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied);
    expect(deniedAudit?.outcome).toBe("denied");
    expect(deniedAudit?.result_code).toBe(INJECTION_ERROR_CODES.grantDenied);
  });

  it("denies issue when project and environment coordinates disagree", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_COORD");
    await writeTestSecret(variableKey, new TextEncoder().encode("coord-test"));

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: testProject(),
        environmentId: environmentId.brand(TEST_ENV_B_ID),
        selector: { kind: "variable_key", variableKey },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    await expect(
      issueInjectionGrant({
        organizationId: org,
        projectId: projectId.brand(TEST_PROJECT_B_ID),
        environmentId: testEnvironment(),
        selector: { kind: "variable_key", variableKey },
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });
  });

  it("rejects consume for a binding outside the grant secret set", async () => {
    const org = testOrganization();
    const allowedKey = uniqueVariableKey("FV11_ALLOWED");
    const otherKey = uniqueVariableKey("FV11_OTHER");
    const allowed = await writeTestSecret(allowedKey, new TextEncoder().encode("allowed"));
    const other = await writeTestSecret(otherKey, new TextEncoder().encode("other"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "secret_id", secretId: allowed.secretId },
      actor: testActor(),
    });

    await expect(
      consumeInjectionGrant({
        organizationId: org,
        grantId: issued.grantId,
        secretId: other.secretId,
        actor: testActor(),
      }),
    ).rejects.toBeInstanceOf(InjectionGrantError);
  });

  it("denies consume when a grant row has more than one secret binding", async () => {
    const org = testOrganization();
    const firstKey = uniqueVariableKey("FV11_MULTI_A");
    const secondKey = uniqueVariableKey("FV11_MULTI_B");
    const first = await writeTestSecret(firstKey, new TextEncoder().encode("multi-a"));
    const second = await writeTestSecret(secondKey, new TextEncoder().encode("multi-b"));

    const grantId = injectionGrantId.generate();
    const expiresAt = new Date(Date.now() + 60_000);

    await withTenantScope({ kind: "organization", organizationId: org }, async (sql) => {
      await sql`
        INSERT INTO injection_grants (
          id,
          org_id,
          project_id,
          environment_id,
          variable_keys,
          secret_ids,
          secret_version_id,
          expires_at
        )
        VALUES (
          ${grantId},
          ${org},
          ${testProject()},
          ${testEnvironment()},
          ${[firstKey, secondKey]},
          ${[first.secretId, second.secretId]},
          ${first.secretVersionId},
          ${expiresAt}
        )
      `;
    });

    await expect(
      consumeInjectionGrant({
        organizationId: org,
        grantId,
        variableKey: firstKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });
  });

  it("records grant_expired when consuming after TTL", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_EXPIRED");
    await writeTestSecret(variableKey, new TextEncoder().encode("expires-soon"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      selector: { kind: "variable_key", variableKey },
      actor: testActor(),
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async (sql) => {
      await sql`
        UPDATE injection_grants
        SET expires_at = now() - interval '1 second'
        WHERE id = ${issued.grantId}
      `;
    });

    await expect(
      consumeInjectionGrant({
        organizationId: org,
        grantId: issued.grantId,
        variableKey,
        actor: testActor(),
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantExpired });
  });
});
