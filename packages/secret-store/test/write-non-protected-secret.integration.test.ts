import { decryptSecretValueForRuntime, type WrappedSecretValue } from "@insecur/crypto";
import {
  VALIDATION_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  environmentId,
  projectId,
  userId,
  type VariableKey,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TenantSecretVersionStore,
  closeRuntimeSql,
  decodeInlineCiphertextStorageRef,
  withTenantScope,
} from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";

import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

import {
  createTestKeyring,
  testOrganization,
  uniqueVariableKey,
  writeTestSecret,
} from "./integration-helpers.js";
import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

async function assertSuccessfulWritePersistedArtifacts(
  org: ReturnType<typeof testOrganization>,
  result: Awaited<ReturnType<typeof writeTestSecret>>,
  plaintext: Uint8Array,
): Promise<void> {
  expect(result.createdSecretShape).toBe(true);
  expect(result.secretId).toMatch(/^sec_[0-9A-Z]{26}$/);
  expect(result.secretVersionId).toMatch(/^sv_[0-9A-Z]{26}$/);
  expect(result.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);
  expect(JSON.stringify(result)).not.toContain(new TextDecoder().decode(plaintext));

  const current = await withTenantScope({ kind: "organization", organizationId: org }, ({ db }) =>
    new TenantSecretVersionStore(db).getCurrentVersion(result.secretId),
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
}

describeIntegration("writeNonProtectedSecret (tenant-scoped store)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("appends a version, sets current, and persists wrapped material only", async () => {
    const org = testOrganization();
    const plaintext = new TextEncoder().encode(`fv10-${crypto.randomUUID()}`);
    const result = await writeTestSecret(uniqueVariableKey("FV10_WRITE"), plaintext);
    await assertSuccessfulWritePersistedArtifacts(org, result, plaintext);
  });

  it("updates an existing secret by variable key with a new current version", async () => {
    const org = testOrganization();
    const variableKey = uniqueVariableKey("FV10_UPDATE");
    const first = await writeTestSecret(variableKey, new TextEncoder().encode("first-value"));
    const second = await writeTestSecret(variableKey, new TextEncoder().encode("second-value"));

    expect(second.secretId).toBe(first.secretId);
    expect(second.createdSecretShape).toBe(false);
    expect(second.secretVersionId).not.toBe(first.secretVersionId);

    const current = await withTenantScope({ kind: "organization", organizationId: org }, ({ db }) =>
      new TenantSecretVersionStore(db).getCurrentVersion(second.secretId),
    );
    expect(current?.secretVersionId).toBe(second.secretVersionId);
    expect(current?.versionNumber).toBe(2);
  });

  it("decrypts with a second keyring instance after write (DB-backed wrapped DEKs)", async () => {
    const org = testOrganization();
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const environment = environmentId.brand(TEST_ENV_A_ID);
    const plaintext = new TextEncoder().encode(`durable-dek-${crypto.randomUUID()}`);
    const variableKey = uniqueVariableKey("FV10_DURABLE");

    const written = await writeTestSecret(variableKey, plaintext);

    const current = await withTenantScope({ kind: "organization", organizationId: org }, ({ db }) =>
      new TenantSecretVersionStore(db).getCurrentVersion(written.secretId),
    );
    if (!current) {
      throw new Error("expected persisted secret version");
    }

    const storageRef = await loadStorageRef(org, current.secretVersionId);
    if (!storageRef) {
      throw new Error("expected ciphertext storage ref");
    }
    const ciphertext = decodeInlineCiphertextStorageRef(storageRef);
    const wrapped: WrappedSecretValue = {
      organizationDataKeyVersion: current.organizationDataKeyVersion,
      projectDataKeyVersion: current.projectDataKeyVersion,
      ciphertext,
    };

    const decrypted = await decryptSecretValueForRuntime(
      createTestKeyring(),
      {
        organizationId: org,
        projectId: project,
        environmentId: environment,
        secretId: written.secretId,
      },
      wrapped,
    );
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
  });

  it("concurrent first-use mints share one persisted DEK and both writers decrypt", async () => {
    const org = testOrganization();
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const environment = environmentId.brand(TEST_ENV_A_ID);

    const savedOrgRef = await withTenantScope(
      { kind: "organization", organizationId: org },
      ({ sql }) =>
        sql<{ wrapped_storage_ref: string | null }[]>`
          SELECT wrapped_storage_ref
          FROM organization_data_keys
          WHERE org_id = ${TEST_ORG_A_ID}
          LIMIT 1
        `,
    );
    const savedProjectRef = await withTenantScope(
      { kind: "organization", organizationId: org },
      ({ sql }) =>
        sql<{ wrapped_storage_ref: string | null }[]>`
          SELECT wrapped_storage_ref
          FROM project_data_keys
          WHERE project_id = ${TEST_PROJECT_A_ID}
          LIMIT 1
        `,
    );

    await withTenantScope(
      { kind: "organization", organizationId: org },
      ({ sql }) =>
        sql`
        UPDATE organization_data_keys
        SET wrapped_storage_ref = NULL
        WHERE org_id = ${TEST_ORG_A_ID}
      `,
    );
    await withTenantScope(
      { kind: "organization", organizationId: org },
      ({ sql }) =>
        sql`
        UPDATE project_data_keys
        SET wrapped_storage_ref = NULL
        WHERE project_id = ${TEST_PROJECT_A_ID}
      `,
    );

    try {
      const plain1 = new TextEncoder().encode(`concurrent-a-${crypto.randomUUID()}`);
      const plain2 = new TextEncoder().encode(`concurrent-b-${crypto.randomUUID()}`);
      const [firstWrite, secondWrite] = await Promise.all([
        writeTestSecret(uniqueVariableKey("FV10_CONCURRENT_A"), plain1),
        writeTestSecret(uniqueVariableKey("FV10_CONCURRENT_B"), plain2),
      ]);

      for (const [written, plaintext] of [
        [firstWrite, plain1],
        [secondWrite, plain2],
      ] as const) {
        const current = await withTenantScope(
          { kind: "organization", organizationId: org },
          ({ db }) => new TenantSecretVersionStore(db).getCurrentVersion(written.secretId),
        );
        if (!current) {
          throw new Error("expected persisted secret version");
        }

        const storageRef = await loadStorageRef(org, current.secretVersionId);
        if (!storageRef) {
          throw new Error("expected ciphertext storage ref");
        }

        const decrypted = await decryptSecretValueForRuntime(
          createTestKeyring(),
          {
            organizationId: org,
            projectId: project,
            environmentId: environment,
            secretId: written.secretId,
          },
          {
            organizationDataKeyVersion: current.organizationDataKeyVersion,
            projectDataKeyVersion: current.projectDataKeyVersion,
            ciphertext: decodeInlineCiphertextStorageRef(storageRef),
          },
        );
        expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
          new TextDecoder().decode(plaintext),
        );
      }
    } finally {
      await withTenantScope(
        { kind: "organization", organizationId: org },
        ({ sql }) =>
          sql`
          UPDATE organization_data_keys
          SET wrapped_storage_ref = ${savedOrgRef[0]?.wrapped_storage_ref ?? null}
          WHERE org_id = ${TEST_ORG_A_ID}
        `,
      );
      await withTenantScope(
        { kind: "organization", organizationId: org },
        ({ sql }) =>
          sql`
          UPDATE project_data_keys
          SET wrapped_storage_ref = ${savedProjectRef[0]?.wrapped_storage_ref ?? null}
          WHERE project_id = ${TEST_PROJECT_A_ID}
        `,
      );
    }
  });

  it("records denied audit for invalid Variable Key without creating a secret", async () => {
    const org = testOrganization();
    const invalidKey = "invalid-variable-key" as VariableKey;
    const sensitive = new TextEncoder().encode("must-not-persist");

    await expect(
      writeNonProtectedSecret({
        keyring: createTestKeyring(),
        organizationId: org,
        projectId: projectId.brand(TEST_PROJECT_A_ID),
        environmentId: environmentId.brand(TEST_ENV_A_ID),
        variableKey: invalidKey,
        actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
        valueUtf8: sensitive,
      }),
    ).rejects.toMatchObject({ code: VALIDATION_ERROR_CODES.invalidVariableKey });

    const secretRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      ({ sql }) =>
        sql<{ id: string }[]>`
          SELECT id
          FROM secrets
          WHERE environment_id = ${TEST_ENV_A_ID}
            AND variable_key = ${invalidKey}
        `,
    );
    expect(secretRows).toHaveLength(0);

    const deniedAudit = await withTenantScope(
      { kind: "organization", organizationId: org },
      ({ sql }) =>
        sql<{ event_code: string; result_code: string; resource_id: string | null }[]>`
          SELECT event_code, result_code, resource_id
          FROM audit_events
          WHERE event_code = ${"secret.non_protected_write_denied"}
          ORDER BY created_at DESC
          LIMIT 1
        `,
    );
    expect(deniedAudit[0]?.result_code).toBe(VALIDATION_ERROR_CODES.invalidVariableKey);
    expect(deniedAudit[0]?.resource_id).toBeNull();
    expect(JSON.stringify(deniedAudit)).not.toContain(new TextDecoder().decode(sensitive));
    expect(JSON.stringify(deniedAudit)).not.toContain(invalidKey);
  });
});

async function loadStorageRef(
  org: ReturnType<typeof testOrganization>,
  secretVersionId: string,
): Promise<string | undefined> {
  const rows = await withTenantScope(
    { kind: "organization", organizationId: org },
    ({ sql }) =>
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
    ({ sql }) =>
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
