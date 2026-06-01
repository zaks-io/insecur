import { configureKeyring, createKeyring, resetKeyringForTests } from "@insecur/crypto";
import {
  brandOpaqueResourceIdForPrefix,
  INJECTION_ERROR_CODES,
  type VariableKey,
} from "@insecur/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
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
    await writeTestSecret(variableKey, plaintext);

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      variableKeys: [variableKey],
      actor: testActor(),
    });

    expect(issued.grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(issued.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);
    expect(JSON.stringify(issued)).not.toContain(new TextDecoder().decode(plaintext));

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

    expect(consumed.variableKey).toBe(variableKey);
    expect(new TextDecoder().decode(consumed.valueUtf8)).toBe(new TextDecoder().decode(plaintext));
    expect(JSON.stringify({ variableKey: consumed.variableKey })).not.toContain(
      new TextDecoder().decode(plaintext),
    );

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

  it("rejects consume for a variable key outside the grant binding", async () => {
    const org = testOrganization();
    const allowedKey = uniqueVariableKey("FV11_ALLOWED");
    const otherKey = uniqueVariableKey("FV11_OTHER");
    await writeTestSecret(allowedKey, new TextEncoder().encode("allowed"));
    await writeTestSecret(otherKey, new TextEncoder().encode("other"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      variableKeys: [allowedKey],
      actor: testActor(),
    });

    await expect(
      consumeInjectionGrant({
        organizationId: org,
        grantId: issued.grantId,
        variableKey: otherKey,
        actor: testActor(),
      }),
    ).rejects.toBeInstanceOf(InjectionGrantError);
  });

  it("records grant_expired when consuming after TTL", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV11_EXPIRED");
    await writeTestSecret(variableKey, new TextEncoder().encode("expires-soon"));

    const issued = await issueInjectionGrant({
      organizationId: org,
      projectId: testProject(),
      environmentId: testEnvironment(),
      variableKeys: [variableKey],
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
