import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { recordStorageAuditInTenantScope } from "@insecur/audit";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";

import { testOrganization, uniqueVariableKey, writeTestSecret } from "./integration-helpers.js";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordStorageAuditInTenantScope: vi.fn(actual.recordStorageAuditInTenantScope),
  };
});

const auditInScopeMock = vi.mocked(recordStorageAuditInTenantScope);

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

interface PersistedWriteArtifacts {
  readonly versionIds: string[];
  readonly successAuditEventIds: string[];
}

async function loadPersistedWriteArtifacts(variableKey: string): Promise<PersistedWriteArtifacts> {
  return withTenantScope(
    { kind: "organization", organizationId: testOrganization() },
    async ({ sql }) => {
      const versions = await sql<{ id: string; secret_id: string }[]>`
        SELECT sv.id, sv.secret_id
        FROM secret_versions sv
        JOIN secrets s ON s.id = sv.secret_id
        WHERE s.variable_key = ${variableKey}
      `;
      const secretIds = [...new Set(versions.map((row) => row.secret_id))];
      const audits =
        secretIds.length === 0
          ? []
          : await sql<{ id: string }[]>`
              SELECT id
              FROM audit_events
              WHERE event_code = ${"secret.non_protected_write"}
                AND resource_id = ${secretIds[0] as string}
            `;
      return {
        versionIds: versions.map((row) => row.id),
        successAuditEventIds: audits.map((row) => row.id),
      };
    },
  );
}

describeIntegration("blind secret write and success audit atomicity", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("rolls back the secret version when the success audit fails, and a retry persists exactly one version with one success audit", async () => {
    const variableKey = uniqueVariableKey("INS579_ATOMIC");
    const plaintext = new TextEncoder().encode(`atomic-${crypto.randomUUID()}`);

    auditInScopeMock.mockRejectedValueOnce(new Error("injected audit failure"));

    await expect(writeTestSecret(variableKey, plaintext)).rejects.toThrow("injected audit failure");

    const afterFailure = await loadPersistedWriteArtifacts(variableKey);
    expect(afterFailure.versionIds).toHaveLength(0);
    expect(afterFailure.successAuditEventIds).toHaveLength(0);

    const retried = await writeTestSecret(variableKey, plaintext);
    expect(retried.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);

    const afterRetry = await loadPersistedWriteArtifacts(variableKey);
    expect(afterRetry.versionIds).toEqual([retried.secretVersionId]);
    expect(afterRetry.successAuditEventIds).toEqual([retried.auditEventId]);
  });
});
