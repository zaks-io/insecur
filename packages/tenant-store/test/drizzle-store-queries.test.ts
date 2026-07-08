import {
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  providerCredentialId,
  secretId,
  secretVersionId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { testDescriptiveVerdicts } from "./helpers/descriptive-verdicts.js";
import { TenantDataKeyMetadataStore } from "../src/data-keys/tenant-data-key-metadata-store.js";
import {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
} from "../src/injection-grants/assert-project-environment-coordinate.js";
import { TenantInjectionGrantStore } from "../src/injection-grants/tenant-injection-grant-store.js";
import { TenantProviderCredentialStore } from "../src/provider-credentials/tenant-provider-credential-store.js";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantSecretVersionStore,
} from "../src/secrets/tenant-secret-version-store.js";
import { resolveSecretForRead } from "../src/secrets/resolve-secret-for-read.js";
import { resolveSecretForWrite } from "../src/secrets/resolve-secret-for-write.js";
import { encodeInlineCiphertextStorageRef } from "../src/secrets/ciphertext-storage-ref.js";
import { TenantSensitiveMetadataStore } from "../src/sensitive-metadata/tenant-sensitive-metadata-store.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_ORG_KEY_A_ID,
  TEST_PROJECT_KEY_A_ID,
  TEST_SECRET_A_ID,
} from "./rls/test-ids.js";
import { createMockTenantDb } from "./helpers/mock-tenant-db.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const ENV = environmentId.brand(TEST_ENV_A_ID);
const VARIABLE_KEY = "ARCH05_UNITTEST" as VariableKey;

function writeInput(secretIdValue?: SecretId) {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    variableKey: VARIABLE_KEY,
    ...(secretIdValue !== undefined ? { secretId: secretIdValue } : {}),
  };
}

describe("resolveSecretForWrite (Drizzle)", () => {
  it("returns an existing secret matched by variable key", async () => {
    const existing = secretId.brand(TEST_SECRET_A_ID);
    const { db } = createMockTenantDb({
      selectResults: [[{ id: existing }]],
    });

    const resolved = await resolveSecretForWrite(db, writeInput());
    expect(resolved).toEqual({ secretId: existing, createdSecretShape: false });
  });

  it("inserts a new secret when variable key is missing", async () => {
    const { db, insertValues } = createMockTenantDb({ selectResults: [[]] });

    const resolved = await resolveSecretForWrite(db, writeInput());
    expect(resolved.createdSecretShape).toBe(true);
    expect(insertValues[0]?.variableKey).toBe(VARIABLE_KEY);
  });

  it("creates a secret row for an explicit id when missing", async () => {
    const explicit = secretId.generate();
    const { db, insertValues } = createMockTenantDb({ selectResults: [[]] });
    const resolved = await resolveSecretForWrite(db, writeInput(explicit));
    expect(resolved).toEqual({ secretId: explicit, createdSecretShape: true });
    expect(insertValues[0]?.id).toBe(explicit);
  });

  it("rejects explicit secret id when environment or variable key mismatches", async () => {
    const explicit = secretId.brand(TEST_SECRET_A_ID);
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: explicit,
            environmentId: ENV,
            variableKey: "OTHER_KEY",
          },
        ],
      ],
    });

    await expect(resolveSecretForWrite(db, writeInput(explicit))).rejects.toBeInstanceOf(
      SecretVersionStoreConflictError,
    );
  });
});

describe("resolveSecretForRead (Drizzle)", () => {
  it("resolves by variable key", async () => {
    const existing = secretId.brand(TEST_SECRET_A_ID);
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: existing,
            project_id: PROJECT,
            environment_id: ENV,
            variable_key: VARIABLE_KEY,
          },
        ],
      ],
    });

    const resolved = await resolveSecretForRead(db, {
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      variableKey: VARIABLE_KEY,
    });
    expect(resolved.secretId).toBe(existing);
  });

  it("throws when secret is missing", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    await expect(
      resolveSecretForRead(db, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        variableKey: VARIABLE_KEY,
      }),
    ).rejects.toBeInstanceOf(SecretVersionStoreNotFoundError);
  });

  it("resolves by explicit secret id and optional variable key check", async () => {
    const explicit = secretId.brand(TEST_SECRET_A_ID);
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: explicit,
            projectId: PROJECT,
            environmentId: ENV,
            variableKey: VARIABLE_KEY,
          },
        ],
      ],
    });
    const resolved = await resolveSecretForRead(db, {
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: explicit,
    });
    expect(resolved.secretId).toBe(explicit);
    expect(resolved.variableKey).toBe(VARIABLE_KEY);
  });

  it("requires exactly one selector", async () => {
    const { db } = createMockTenantDb();
    await expect(
      resolveSecretForRead(db, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).rejects.toThrow("exactly one of variableKey or secretId is required");
  });
});

describe("TenantSecretVersionStore (Drizzle)", () => {
  const secretIdValue = secretId.brand(TEST_SECRET_A_ID);
  const versionIdValue = secretVersionId.generate();

  it("returns null when version row is absent", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantSecretVersionStore(db);
    await expect(store.getVersionById(secretIdValue, versionIdValue)).resolves.toBeNull();
  });

  it("rejects version rows missing data-key version metadata", async () => {
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: versionIdValue,
            orgId: ORG,
            secretId: secretIdValue,
            versionNumber: 1,
            lifecycleState: "live",
            organizationDataKeyVersion: null,
            projectDataKeyVersion: null,
            ciphertextStorageRef: encodeInlineCiphertextStorageRef(new Uint8Array([1])),
          },
        ],
      ],
    });
    const store = new TenantSecretVersionStore(db);
    await expect(store.getVersionById(secretIdValue, versionIdValue)).rejects.toThrow(
      "secret version missing data key version metadata",
    );
  });

  it("maps a stored version row to wrapped material metadata", async () => {
    const storageRef = encodeInlineCiphertextStorageRef(new Uint8Array([1, 2, 3]));
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: versionIdValue,
            orgId: ORG,
            secretId: secretIdValue,
            versionNumber: 2,
            lifecycleState: "live",
            organizationDataKeyVersion: 1,
            projectDataKeyVersion: 1,
            ciphertextStorageRef: storageRef,
          },
        ],
      ],
    });
    const store = new TenantSecretVersionStore(db);
    const row = await store.getVersionById(secretIdValue, versionIdValue);
    expect(row?.versionNumber).toBe(2);
    expect(row?.wrapped.ciphertext).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("appendVersionAndMakeLive allocates the next version under row lock", async () => {
    const { db, insertValues } = createMockTenantDb({
      selectResults: [[{ id: secretIdValue }], [{ maxVersion: 2 }], [{ currentVersionId: null }]],
      updateReturning: [[{ id: secretIdValue }]],
    });
    const store = new TenantSecretVersionStore(db);
    const result = await store.appendVersionAndMakeLive({
      organizationId: ORG,
      secretId: secretIdValue,
      secretVersionId: versionIdValue,
      createdSecretShape: false,
      descriptiveVerdicts: testDescriptiveVerdicts(),
      wrapped: {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: 1,
        ciphertext: new Uint8Array([9]),
      },
    });
    expect(result.versionNumber).toBe(3);
    expect(result.lifecycleState).toBe("live");
    expect(insertValues[0]?.versionNumber).toBe(3);
  });

  it("throws when append lock target is missing", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantSecretVersionStore(db);
    await expect(
      store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: secretIdValue,
        secretVersionId: versionIdValue,
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts(),
        wrapped: {
          organizationDataKeyVersion: 1,
          projectDataKeyVersion: 1,
          ciphertext: new Uint8Array([1]),
        },
      }),
    ).rejects.toBeInstanceOf(SecretVersionStoreNotFoundError);
  });

  it("returns current version via secret pointer", async () => {
    const storageRef = encodeInlineCiphertextStorageRef(new Uint8Array([7, 8]));
    const { db } = createMockTenantDb({
      selectResults: [
        [{ id: secretIdValue, orgId: ORG, currentVersionId: versionIdValue }],
        [
          {
            id: versionIdValue,
            orgId: ORG,
            secretId: secretIdValue,
            versionNumber: 1,
            lifecycleState: "live",
            organizationDataKeyVersion: 1,
            projectDataKeyVersion: 1,
            ciphertextStorageRef: storageRef,
          },
        ],
      ],
    });
    const store = new TenantSecretVersionStore(db);
    const current = await store.getCurrentVersion(secretIdValue);
    expect(current?.secretVersionId).toBe(versionIdValue);
  });

  it("returns deliverable versions for live and retained lifecycle states", async () => {
    const storageRef = encodeInlineCiphertextStorageRef(new Uint8Array([7, 8]));
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: versionIdValue,
            orgId: ORG,
            secretId: secretIdValue,
            versionNumber: 1,
            lifecycleState: "retained",
            organizationDataKeyVersion: 1,
            projectDataKeyVersion: 1,
            ciphertextStorageRef: storageRef,
          },
        ],
      ],
    });
    const store = new TenantSecretVersionStore(db);
    const retained = await store.getDeliverableVersion(secretIdValue, versionIdValue);
    expect(retained?.lifecycleState).toBe("retained");
  });

  it("rejects draft versions as not deliverable", async () => {
    const storageRef = encodeInlineCiphertextStorageRef(new Uint8Array([7, 8]));
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: versionIdValue,
            orgId: ORG,
            secretId: secretIdValue,
            versionNumber: 2,
            lifecycleState: "draft",
            organizationDataKeyVersion: 1,
            projectDataKeyVersion: 1,
            ciphertextStorageRef: storageRef,
          },
        ],
      ],
    });
    const store = new TenantSecretVersionStore(db);
    await expect(store.getDeliverableVersion(secretIdValue, versionIdValue)).rejects.toBeInstanceOf(
      SecretVersionStoreConflictError,
    );
  });
});

describe("TenantInjectionGrantStore (Drizzle)", () => {
  const grantIdValue = injectionGrantId.generate();
  const boundSecret = secretId.brand(TEST_SECRET_A_ID);
  const boundVersion = secretVersionId.generate();

  function boundGrantRow(
    overrides: Partial<{
      consumed_at: Date | null;
      expires_at: Date;
      variable_keys: string[];
      secret_ids: string[];
    }> = {},
  ) {
    return {
      id: grantIdValue,
      org_id: ORG,
      project_id: PROJECT,
      environment_id: ENV,
      variable_keys: [VARIABLE_KEY],
      secret_ids: [TEST_SECRET_A_ID],
      secret_version_ids: [boundVersion],
      policy_id: null,
      policy_version_id: null,
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
      revoked_at: null,
      revoked_reason: null,
      ...overrides,
    };
  }

  it("classifies consume failures from grant metadata", () => {
    const store = new TenantInjectionGrantStore({} as never);
    const grant = {
      id: grantIdValue,
      org_id: ORG,
      project_id: PROJECT,
      environment_id: ENV,
      variable_keys: ["A"],
      secret_ids: ["sec_a", "sec_b"],
      secret_version_ids: ["sv_x"],
      policy_id: null,
      policy_version_id: null,
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
      revoked_at: null,
      revoked_reason: null,
    };
    expect(store.getBoundGrant(grant)).toBeNull();
    expect(
      store.classifyConsumeFailure(grant, secretId.brand(TEST_SECRET_A_ID), VARIABLE_KEY),
    ).toBe("not_found");
  });

  it("returns a bound grant projection for single-target grants", () => {
    const store = new TenantInjectionGrantStore({} as never);
    const bound = store.getBoundGrant(boundGrantRow());
    expect(bound?.secretId).toBe(boundSecret);
    expect(bound?.variableKey).toBe(VARIABLE_KEY);
  });

  it("classifies expired and consumed grants", () => {
    const store = new TenantInjectionGrantStore({} as never);
    expect(
      store.classifyConsumeFailure(
        boundGrantRow({ expires_at: new Date(Date.now() - 1_000) }),
        boundSecret,
        VARIABLE_KEY,
      ),
    ).toBe("expired");
    expect(
      store.classifyConsumeFailure(
        boundGrantRow({ consumed_at: new Date() }),
        boundSecret,
        VARIABLE_KEY,
      ),
    ).toBe("already_consumed");
    expect(
      store.classifyConsumeFailure(
        boundGrantRow({ revoked_at: new Date(), revoked_reason: "tenant_suspension" }),
        boundSecret,
        VARIABLE_KEY,
      ),
    ).toBe("revoked");
    expect(store.classifyConsumeFailure(boundGrantRow(), secretId.generate(), VARIABLE_KEY)).toBe(
      "binding_not_allowed",
    );
  });

  it("asserts issue coordinates through the environment lookup", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[{ projectId: PROJECT, isProtected: false }]],
    });
    const store = new TenantInjectionGrantStore(db);
    await expect(
      store.assertIssueCoordinate({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).resolves.toEqual({ isProtected: false });
  });

  it("loads a grant row by id", async () => {
    const row = boundGrantRow();
    const { db } = createMockTenantDb({ selectResults: [[row]] });
    const store = new TenantInjectionGrantStore(db);
    await expect(store.getGrant(ORG, grantIdValue)).resolves.toEqual(row);
  });

  it("inserts a bound grant row", async () => {
    const { db, insertValues } = createMockTenantDb();
    const store = new TenantInjectionGrantStore(db);
    await store.insertGrant({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      grantId: grantIdValue,
      bindings: [
        {
          secretId: boundSecret,
          secretVersionId: boundVersion,
          variableKey: VARIABLE_KEY,
        },
      ],
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(insertValues[0]?.secretVersionIds).toEqual([boundVersion]);
  });

  it("consumes a grant when the update wins the race", async () => {
    const consumedRow = boundGrantRow({ consumed_at: new Date() });
    const { db } = createMockTenantDb({
      selectResults: [[boundGrantRow()], [consumedRow]],
      updateReturning: [[consumedRow]],
    });
    const store = new TenantInjectionGrantStore(db);
    const result = await store.tryConsumeGrant(ORG, grantIdValue, boundSecret, VARIABLE_KEY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.grant.secretId).toBe(boundSecret);
    }
  });

  it("returns a failure reason after a lost consume race", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[boundGrantRow()], [boundGrantRow({ consumed_at: new Date() })]],
      updateReturning: [[]],
    });
    const store = new TenantInjectionGrantStore(db);
    const result = await store.tryConsumeGrant(ORG, grantIdValue, boundSecret, VARIABLE_KEY);
    expect(result).toEqual({ ok: false, reason: "already_consumed" });
  });
});

describe("assertProjectEnvironmentCoordinate (Drizzle)", () => {
  it("returns isProtected true when environment is protected", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[{ projectId: PROJECT, isProtected: true }]],
    });
    await expect(
      assertProjectEnvironmentCoordinate(db, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).resolves.toEqual({ isProtected: true });
  });

  it("returns when environment belongs to the project", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[{ projectId: PROJECT, isProtected: false }]],
    });
    await expect(
      assertProjectEnvironmentCoordinate(db, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).resolves.toEqual({ isProtected: false });
  });

  it("throws when environment is missing", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    await expect(
      assertProjectEnvironmentCoordinate(db, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).rejects.toBeInstanceOf(ProjectEnvironmentCoordinateError);
  });

  // INS-154 attack vector: the environment exists in the org but is owned by a different project
  // than the URL project. Must reject so a project-scoped principal cannot write across projects.
  it("throws when the environment belongs to a different project in the same org", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[{ projectId: projectId.brand(TEST_PROJECT_B_ID), isProtected: false }]],
    });
    await expect(
      assertProjectEnvironmentCoordinate(db, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).rejects.toBeInstanceOf(ProjectEnvironmentCoordinateError);
  });
});

describe("TenantDataKeyMetadataStore (Drizzle)", () => {
  const orgKeyRow = {
    id: TEST_ORG_KEY_A_ID,
    org_id: ORG,
    key_version: 2,
    status: "retired" as const,
    root_key_version: 1,
    wrapped_storage_ref: null,
    custody_evidence_ref: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const projectKeyRow = {
    id: TEST_PROJECT_KEY_A_ID,
    org_id: ORG,
    project_id: PROJECT,
    key_version: 2,
    status: "active" as const,
    organization_data_key_version: 1,
    wrapped_storage_ref: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  it("returns active organization data key metadata", async () => {
    const { db } = createMockTenantDb({ selectResults: [[orgKeyRow]] });
    const store = new TenantDataKeyMetadataStore(db);
    const row = await store.getActiveOrganizationDataKey(ORG);
    expect(row?.keyVersion).toBe(2);
    expect(row?.status).toBe("retired");
  });

  it("rejects unknown data key status values from the database", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[{ ...orgKeyRow, status: "bogus" }]],
    });
    const store = new TenantDataKeyMetadataStore(db);
    await expect(store.getActiveOrganizationDataKey(ORG)).rejects.toThrow(
      "invalid data key status in store",
    );
  });

  it("falls back to latest organization key for readiness", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[], [orgKeyRow]],
    });
    const store = new TenantDataKeyMetadataStore(db);
    const row = await store.getOrganizationDataKeyForReadiness(ORG);
    expect(row?.keyVersion).toBe(2);
  });

  it("reads organization keys by version", async () => {
    const { db } = createMockTenantDb({ selectResults: [[orgKeyRow]] });
    const store = new TenantDataKeyMetadataStore(db);
    const row = await store.getOrganizationDataKeyVersion(ORG, 2);
    expect(row?.keyVersion).toBe(2);
  });

  it("reads active project keys", async () => {
    const { db } = createMockTenantDb({ selectResults: [[projectKeyRow]] });
    const store = new TenantDataKeyMetadataStore(db);
    const row = await store.getActiveProjectDataKey(ORG, PROJECT);
    expect(row?.keyVersion).toBe(2);
  });

  it("reads project keys by version and readiness fallback", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[projectKeyRow], [], [projectKeyRow]],
    });
    const store = new TenantDataKeyMetadataStore(db);
    const byVersion = await store.getProjectDataKeyVersion(ORG, PROJECT, 2);
    expect(byVersion?.organizationDataKeyVersion).toBe(1);
    const readiness = await store.getProjectDataKeyForReadiness(ORG, PROJECT);
    expect(readiness?.keyVersion).toBe(2);
  });

  it("inserts organization and project keys with conflict-do-nothing", async () => {
    const { db, insertValues } = createMockTenantDb();
    const store = new TenantDataKeyMetadataStore(db);
    await store.insertOrganizationDataKey({
      id: "odk_seed",
      organizationId: ORG,
      keyVersion: 3,
    });
    await store.insertProjectDataKey({
      id: "pdk_seed",
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 3,
      organizationDataKeyVersion: 1,
    });
    expect(insertValues).toHaveLength(2);
  });
});

describe("metadata store reads (Drizzle)", () => {
  it("TenantProviderCredentialStore.getCredential maps a stored row", async () => {
    const storageRef = encodeInlineCiphertextStorageRef(new Uint8Array([4, 5]));
    const credId = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: credId,
            org_id: ORG,
            app_connection_id: "conn_test",
            provider: "github",
            organization_data_key_version: 1,
            ciphertext_storage_ref: storageRef,
          },
        ],
      ],
    });
    const store = new TenantProviderCredentialStore(db);
    const row = await store.getCredential(ORG, credId);
    expect(row?.provider).toBe("github");
    expect(row?.wrapped.ciphertext).toEqual(new Uint8Array([4, 5]));
  });

  it("TenantSensitiveMetadataStore.getField returns null when absent", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantSensitiveMetadataStore(db);
    await expect(
      store.getField({
        organizationId: ORG,
        scopeProjectId: "",
        metadataType: "approval.note",
        recordResourceId: "rec_test" as never,
        fieldKey: "body",
      }),
    ).resolves.toBeNull();
  });
});
