import { afterEach, describe, expect, it } from "vitest";
import { createTestAuditExportKeyProviders } from "../../../../packages/audit/test/support/test-audit-export-keys.js";
import { resolveAuditExportKeyProviders } from "./audit-export-key-providers.js";
import { AuditExportKeysNotConfiguredError } from "./audit-export-keys-not-configured-error.js";

describe("resolveAuditExportKeyProviders", () => {
  const originalHmac = process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET;
  const originalPrivate = process.env.INSECUR_AUDIT_EXPORT_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL;
  const originalPublic = process.env.INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY;

  afterEach(() => {
    if (originalHmac === undefined) {
      delete process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET;
    } else {
      process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET = originalHmac;
    }
    if (originalPrivate === undefined) {
      delete process.env.INSECUR_AUDIT_EXPORT_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL;
    } else {
      process.env.INSECUR_AUDIT_EXPORT_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL = originalPrivate;
    }
    if (originalPublic === undefined) {
      delete process.env.INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY;
    } else {
      process.env.INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY = originalPublic;
    }
  });

  it("reads production keys only from Secrets Store bindings", async () => {
    process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET = "env-hmac";
    process.env.INSECUR_AUDIT_EXPORT_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL = "env-private";
    process.env.INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY = "env-public";

    await expect(
      resolveAuditExportKeyProviders({
        RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret-000000000000000000000000",
        SENTRY_ENVIRONMENT: "production",
      }),
    ).rejects.toBeInstanceOf(AuditExportKeysNotConfiguredError);
  });

  it("prefers Secrets Store bindings in production", async () => {
    const keys = await createTestAuditExportKeyProviders();
    const signingMaterial = JSON.stringify({
      keyVersion: 2,
      privateKeyPkcs8Base64Url: keys.signingPrivateKeyPkcs8Base64Url,
      publicKeyRawBase64Url: keys.signingPublicKey,
    });
    const providers = await resolveAuditExportKeyProviders({
      RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret-000000000000000000000000",
      SENTRY_ENVIRONMENT: "production",
      AUDIT_EXPORT_HMAC_KEY_V1: { get: async () => keys.hmacSecret },
      AUDIT_EXPORT_SIGNING_KEY_V1: { get: async () => signingMaterial },
    });

    expect(providers.hmacKey.keyVersion).toBe(1);
    expect(providers.signingKey.keyVersion).toBe(2);
    expect(providers.signingKey.publicKeyBase64Url).toBe(keys.signingPublicKey);
  });

  it("allows plaintext HMAC env fallback outside production when bindings are absent", async () => {
    const keys = await createTestAuditExportKeyProviders();
    process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET = keys.hmacSecret;

    await expect(
      resolveAuditExportKeyProviders({
        RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret-000000000000000000000000",
        SENTRY_ENVIRONMENT: "preview",
      }),
    ).rejects.toBeInstanceOf(AuditExportKeysNotConfiguredError);
  });

  it("requires signing keys from Secrets Store bindings even outside production", async () => {
    const keys = await createTestAuditExportKeyProviders();
    process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET = keys.hmacSecret;
    process.env.INSECUR_AUDIT_EXPORT_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL =
      keys.signingPrivateKeyPkcs8Base64Url;
    process.env.INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY = keys.signingPublicKey;

    await expect(
      resolveAuditExportKeyProviders({
        RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret-000000000000000000000000",
        SENTRY_ENVIRONMENT: "preview",
      }),
    ).rejects.toBeInstanceOf(AuditExportKeysNotConfiguredError);
  });

  it("resolves signing keys from Secrets Store bindings outside production", async () => {
    const keys = await createTestAuditExportKeyProviders();
    process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET = keys.hmacSecret;
    const signingMaterial = JSON.stringify({
      keyVersion: 1,
      privateKeyPkcs8Base64Url: keys.signingPrivateKeyPkcs8Base64Url,
      publicKeyRawBase64Url: keys.signingPublicKey,
    });

    const providers = await resolveAuditExportKeyProviders({
      RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret-000000000000000000000000",
      SENTRY_ENVIRONMENT: "preview",
      AUDIT_EXPORT_SIGNING_KEY_V1: { get: async () => signingMaterial },
    });

    expect(providers.hmacKey.keyVersion).toBe(1);
    expect(providers.signingKey.publicKeyBase64Url).toBe(keys.signingPublicKey);
  });
});
