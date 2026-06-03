import {
  appConnectionId,
  auditEventId,
  organizationId,
  projectId,
  providerCredentialId,
} from "@insecur/domain";
import {
  configureKeyring,
  encryptProviderCredential,
  encryptSensitiveMetadata,
  resetKeyringForTests,
  SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
} from "@insecur/crypto";
import { createKeyring } from "@insecur/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeInlineCiphertextStorageRef } from "../src/secrets/ciphertext-storage-ref.js";
import { TenantProviderCredentialStore } from "../src/provider-credentials/tenant-provider-credential-store.js";
import { TenantSensitiveMetadataStore } from "../src/sensitive-metadata/tenant-sensitive-metadata-store.js";
import type { TenantScopedSql } from "../src/tenant-scoped-sql.js";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const PROJECT = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const RECORD = auditEventId.brand("aud_01JZ8E8B9H3R7N1T6V8W0X2Y4A");

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

function createCapturingSql(): { sql: TenantScopedSql; storageRefs: string[] } {
  const storageRefs: string[] = [];
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    for (const value of values) {
      if (typeof value === "string" && value.startsWith("inline:b64:")) {
        storageRefs.push(value);
      }
    }
    return [];
  }) as unknown as TenantScopedSql;
  return { sql, storageRefs };
}

describe("tenant metadata stores avoid plaintext persistence", () => {
  beforeEach(() => {
    resetKeyringForTests();
    configureKeyring(createKeyring(createTestRootKey()));
  });

  afterEach(() => {
    resetKeyringForTests();
  });

  it("stores provider credentials only as inline ciphertext refs", async () => {
    const plaintext = new TextEncoder().encode("oauth-access-token-value");
    const plaintextText = new TextDecoder().decode(plaintext);
    const wrapped = await encryptProviderCredential(
      {
        organizationId: ORG,
        appConnectionId: CONN,
        provider: "vercel-integration-oauth",
        credentialId: CRED,
      },
      plaintext,
    );
    const { sql, storageRefs } = createCapturingSql();
    const store = new TenantProviderCredentialStore(sql);

    await store.upsertCredential({
      organizationId: ORG,
      appConnectionId: CONN,
      provider: "vercel-integration-oauth",
      credentialId: CRED,
      wrapped,
    });

    expect(storageRefs).toHaveLength(1);
    const storageRef = storageRefs[0];
    expect(storageRef).toBeDefined();
    expect(storageRef).toMatch(/^inline:b64:/);
    expect(storageRef).not.toContain(plaintextText);
    expect(encodeInlineCiphertextStorageRef).toBeDefined();
  });

  it("stores sensitive metadata only as inline ciphertext refs", async () => {
    const plaintext = new TextEncoder().encode("approval-context-note-body");
    const plaintextText = new TextDecoder().decode(plaintext);
    const wrapped = await encryptSensitiveMetadata(
      {
        organizationId: ORG,
        scopeProjectId: SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
        metadataType: "approval.context_note",
        recordResourceId: RECORD,
        fieldKey: "body",
      },
      plaintext,
    );
    const { sql, storageRefs } = createCapturingSql();
    const store = new TenantSensitiveMetadataStore(sql);

    await store.upsertField({
      organizationId: ORG,
      scopeProjectId: SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
      metadataType: "approval.context_note",
      recordResourceId: RECORD,
      fieldKey: "body",
      wrapped,
    });

    expect(storageRefs).toHaveLength(1);
    const storageRef = storageRefs[0];
    expect(storageRef).toBeDefined();
    expect(storageRef).toMatch(/^inline:b64:/);
    expect(storageRef).not.toContain(plaintextText);
  });

  it("stores project-scoped sensitive metadata with project key version metadata", async () => {
    const plaintext = new TextEncoder().encode("provider-target-name");
    const wrapped = await encryptSensitiveMetadata(
      {
        organizationId: ORG,
        scopeProjectId: PROJECT,
        metadataType: "sync.provider_target_name",
        recordResourceId: RECORD,
        fieldKey: "target_name",
      },
      plaintext,
    );
    const { sql, storageRefs } = createCapturingSql();
    const store = new TenantSensitiveMetadataStore(sql);

    await store.upsertField({
      organizationId: ORG,
      scopeProjectId: PROJECT,
      metadataType: "sync.provider_target_name",
      recordResourceId: RECORD,
      fieldKey: "target_name",
      wrapped,
    });

    expect(storageRefs).toHaveLength(1);
    expect(wrapped.projectDataKeyVersion).toBe(1);
  });
});
