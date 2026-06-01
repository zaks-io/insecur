import { configureKeyring, createKeyring, resetKeyringForTests } from "@insecur/crypto";
import { brandOpaqueResourceIdForPrefix } from "@insecur/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  TenantSecretVersionStore,
  closeRuntimeSql,
  decodeInlineCiphertextStorageRef,
  withTenantScope,
} from "@insecur/tenant-store";
import { requireDatabaseUrl } from "../../tenant-store/scripts/lib/env-local.mjs";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";

import { testOrganization, uniqueVariableKey, writeTestSecret } from "./integration-helpers.js";

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

const describeIntegration = runtimeUrl ? describe : describe.skip;

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

describeIntegration("writeNonProtectedSecret (tenant-scoped store)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
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

  it("appends a version, sets current, and persists wrapped material only", async () => {
    const org = testOrganization();
    const plaintext = new TextEncoder().encode(`fv10-${crypto.randomUUID()}`);
    const result = await writeTestSecret(uniqueVariableKey("FV10_WRITE"), plaintext);

    expect(result.createdSecretShape).toBe(true);
    expect(result.secretId).toMatch(/^sec_[0-9A-Z]{26}$/);
    expect(result.secretVersionId).toMatch(/^sv_[0-9A-Z]{26}$/);
    expect(result.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);
    expect(JSON.stringify(result)).not.toContain(new TextDecoder().decode(plaintext));

    const current = await withTenantScope({ kind: "organization", organizationId: org }, (sql) =>
      new TenantSecretVersionStore(sql).getCurrentVersion(result.secretId),
    );
    expect(current?.secretVersionId).toBe(result.secretVersionId);
    expect(current?.versionNumber).toBe(1);

    const storageRef = await loadStorageRef(org, result.secretVersionId);
    expect(storageRef).toMatch(/^inline:b64:/);
    assertStoredCiphertextExcludesPlaintext(storageRef, plaintext);

    const auditRows = await loadAuditRow(org, result.auditEventId);
    expect(auditRows?.event_code).toBe("secret.non_protected_write");
    expect(auditRows?.resource_id).toBe(brandOpaqueResourceIdForPrefix("sec", result.secretId));
    expect(JSON.stringify(auditRows)).not.toContain(new TextDecoder().decode(plaintext));
  });

  it("updates an existing secret by variable key with a new current version", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV10_UPDATE");
    const first = await writeTestSecret(variableKey, new TextEncoder().encode("first-value"));
    const second = await writeTestSecret(variableKey, new TextEncoder().encode("second-value"));

    expect(second.secretId).toBe(first.secretId);
    expect(second.createdSecretShape).toBe(false);
    expect(second.secretVersionId).not.toBe(first.secretVersionId);

    const current = await withTenantScope({ kind: "organization", organizationId: org }, (sql) =>
      new TenantSecretVersionStore(sql).getCurrentVersion(second.secretId),
    );
    expect(current?.secretVersionId).toBe(second.secretVersionId);
    expect(current?.versionNumber).toBe(2);
  });
});

async function loadStorageRef(
  org: ReturnType<typeof testOrganization>,
  secretVersionId: string,
): Promise<string | undefined> {
  const rows = await withTenantScope(
    { kind: "organization", organizationId: org },
    (sql) =>
      sql<{ ciphertext_storage_ref: string }[]>`
      SELECT ciphertext_storage_ref
      FROM secret_versions
      WHERE id = ${secretVersionId}
      LIMIT 1
    `,
  );
  return rows[0]?.ciphertext_storage_ref;
}

async function loadAuditRow(
  org: ReturnType<typeof testOrganization>,
  auditEventId: string | undefined,
): Promise<{ event_code: string; resource_id: string | null } | undefined> {
  if (auditEventId === undefined) {
    return undefined;
  }
  const rows = await withTenantScope(
    { kind: "organization", organizationId: org },
    (sql) =>
      sql<{ event_code: string; resource_id: string | null }[]>`
      SELECT event_code, resource_id
      FROM audit_events
      WHERE id = ${auditEventId}
      LIMIT 1
    `,
  );
  return rows[0];
}

function assertStoredCiphertextExcludesPlaintext(
  storageRef: string | undefined,
  plaintext: Uint8Array,
): void {
  if (!storageRef) {
    return;
  }
  const storedBytes = decodeInlineCiphertextStorageRef(storageRef);
  expect(new TextDecoder().decode(storedBytes)).not.toContain(new TextDecoder().decode(plaintext));
}
