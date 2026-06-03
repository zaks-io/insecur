import {
  brandOpaqueResourceIdForPrefix,
  CRYPTO_ERROR_CODES,
  organizationId,
  projectId,
  type OpaqueResourceId,
} from "@insecur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL } from "../src/constants.js";
import { configureKeyring, resetKeyringForTests } from "../src/crypto-runtime.js";
import { DecryptError } from "../src/errors.js";
import {
  decryptSensitiveMetadataForAuthorizedRead,
  encryptSensitiveMetadata,
  type SensitiveMetadataCiphertextIdentity,
} from "../src/encryption.js";
import { toStoreFacingCiphertext } from "../src/envelope-storage.js";
import { createKeyring } from "../src/keyring.js";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const ORG_B = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const PROJECT_B = projectId.brand("prj_01JZ8E5Y6E0O4K8Q3R5S7T9U1X");
const RECORD_A: OpaqueResourceId = brandOpaqueResourceIdForPrefix(
  "aud",
  "aud_01JZ8E8B9H3R7N1T6V8W0X2Y4A",
);
const RECORD_B: OpaqueResourceId = brandOpaqueResourceIdForPrefix(
  "aud",
  "aud_01JZ8E9C0I4S8O2U7W9X1Y3Z5B",
);

function orgScopedIdentity(
  overrides: Partial<SensitiveMetadataCiphertextIdentity> = {},
): SensitiveMetadataCiphertextIdentity {
  return {
    organizationId: ORG_A,
    scopeProjectId: SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
    metadataType: "approval.context_note",
    recordResourceId: RECORD_A,
    fieldKey: "body",
    ...overrides,
  };
}

function projectScopedIdentity(
  overrides: Partial<SensitiveMetadataCiphertextIdentity> = {},
): SensitiveMetadataCiphertextIdentity {
  return {
    organizationId: ORG_A,
    scopeProjectId: PROJECT_A,
    metadataType: "sync.provider_target_name",
    recordResourceId: RECORD_A,
    fieldKey: "target_name",
    ...overrides,
  };
}

function samplePlaintext(): Uint8Array {
  return new TextEncoder().encode("sensitive-metadata-value");
}

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

describe("encryptSensitiveMetadata / decryptSensitiveMetadataForAuthorizedRead", () => {
  beforeEach(() => {
    resetKeyringForTests();
    configureKeyring(createKeyring(createTestRootKey()));
  });

  afterEach(() => {
    resetKeyringForTests();
  });

  it("round-trips organization-scoped metadata", async () => {
    const plaintext = samplePlaintext();
    const wrapped = await encryptSensitiveMetadata(orgScopedIdentity(), plaintext);
    const decrypted = await decryptSensitiveMetadataForAuthorizedRead(orgScopedIdentity(), wrapped);

    expect(new TextDecoder().decode(decrypted)).toBe(new TextDecoder().decode(plaintext));
    expect(wrapped.projectDataKeyVersion).toBeNull();
    expect(wrapped.organizationDataKeyVersion).toBe(1);
  });

  it("round-trips project-scoped metadata", async () => {
    const plaintext = samplePlaintext();
    const wrapped = await encryptSensitiveMetadata(projectScopedIdentity(), plaintext);
    const decrypted = await decryptSensitiveMetadataForAuthorizedRead(
      projectScopedIdentity(),
      wrapped,
    );

    expect(new TextDecoder().decode(decrypted)).toBe(new TextDecoder().decode(plaintext));
    expect(wrapped.projectDataKeyVersion).toBe(1);
  });

  it("fails closed on identity mismatch for organization-scoped metadata", async () => {
    const wrapped = await encryptSensitiveMetadata(orgScopedIdentity(), samplePlaintext());

    await expect(
      decryptSensitiveMetadataForAuthorizedRead(
        orgScopedIdentity({ organizationId: ORG_B, recordResourceId: RECORD_B }),
        wrapped,
      ),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("fails closed on identity mismatch for project-scoped metadata", async () => {
    const wrapped = await encryptSensitiveMetadata(projectScopedIdentity(), samplePlaintext());

    await expect(
      decryptSensitiveMetadataForAuthorizedRead(
        projectScopedIdentity({ scopeProjectId: PROJECT_B }),
        wrapped,
      ),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("fails closed when project-scoped ciphertext is opened as organization-scoped", async () => {
    const wrapped = await encryptSensitiveMetadata(projectScopedIdentity(), samplePlaintext());

    await expect(
      decryptSensitiveMetadataForAuthorizedRead(orgScopedIdentity(), wrapped),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("returns opaque decrypt errors", async () => {
    const wrapped = await encryptSensitiveMetadata(orgScopedIdentity(), samplePlaintext());
    const tampered = new Uint8Array(wrapped.ciphertext);
    const lastIndex = tampered.byteLength - 1;
    const lastByte = tampered[lastIndex];
    if (lastByte !== undefined) {
      tampered[lastIndex] = lastByte ^ 0xff;
    }

    await expect(
      decryptSensitiveMetadataForAuthorizedRead(orgScopedIdentity(), {
        ...wrapped,
        ciphertext: tampered,
      }),
    ).rejects.toMatchObject({
      name: "DecryptError",
      code: CRYPTO_ERROR_CODES.decryptFailed,
      retryable: false,
    });
  });

  it("does not persist plaintext or identity strings in store-facing ciphertext bytes", async () => {
    const plaintext = samplePlaintext();
    const bound = projectScopedIdentity();
    const wrapped = await encryptSensitiveMetadata(bound, plaintext);
    const storedText = new TextDecoder().decode(toStoreFacingCiphertext(wrapped));

    expect(storedText).not.toContain(new TextDecoder().decode(plaintext));
    expect(storedText).not.toContain(bound.organizationId);
    expect(storedText).not.toContain(bound.scopeProjectId);
    expect(storedText).not.toContain(bound.metadataType);
    expect(storedText).not.toContain(bound.recordResourceId);
    expect(storedText).not.toContain(bound.fieldKey);
  });
});
