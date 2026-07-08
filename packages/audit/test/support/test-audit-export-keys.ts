import {
  StaticAuditExportHmacKeyProvider,
  StaticAuditExportSigningKeyProvider,
  type AuditExportHmacKeyProvider,
  type AuditExportSigningKeyProvider,
} from "@insecur/audit";
import { bytesToBase64Url } from "@insecur/domain";

const TEST_HMAC_SECRET = "integration-audit-export-hmac";

let cachedProviders:
  | {
      readonly hmacKey: AuditExportHmacKeyProvider;
      readonly signingKey: AuditExportSigningKeyProvider;
      readonly hmacSecret: string;
      readonly signingPublicKey: string;
      readonly signingPrivateKeyPkcs8Base64Url: string;
    }
  | undefined;

async function exportEd25519RawPublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  return spki.slice(-32);
}

export async function createTestAuditExportKeyProviders(): Promise<{
  readonly hmacKey: AuditExportHmacKeyProvider;
  readonly signingKey: AuditExportSigningKeyProvider;
  readonly hmacSecret: string;
  readonly signingPublicKey: string;
  readonly signingPrivateKeyPkcs8Base64Url: string;
}> {
  if (cachedProviders !== undefined) {
    return cachedProviders;
  }

  const hmacKey = await StaticAuditExportHmacKeyProvider.create({
    keyVersion: 1,
    secret: new TextEncoder().encode(TEST_HMAC_SECRET),
    custodyEvidenceRef: "escrow-record://instance/test/audit-hmac/v1",
  });

  const generated = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  if (!("privateKey" in generated)) {
    throw new Error("expected Ed25519 key pair");
  }
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", generated.privateKey),
  );
  const publicKeyRaw = await exportEd25519RawPublicKey(generated.publicKey);
  const signingPrivateKeyPkcs8Base64Url = bytesToBase64Url(privateKeyPkcs8);
  const signingKey = await StaticAuditExportSigningKeyProvider.fromPkcs8({
    keyVersion: 1,
    privateKeyPkcs8,
    publicKeyRaw,
    custodyEvidenceRef: "escrow-record://instance/test/audit-signing/v1",
  });

  cachedProviders = {
    hmacKey,
    signingKey,
    hmacSecret: TEST_HMAC_SECRET,
    signingPublicKey: signingKey.publicKeyBase64Url,
    signingPrivateKeyPkcs8Base64Url,
  };

  return cachedProviders;
}

export async function testAuditExportRuntimeEnvVars(): Promise<Record<string, string>> {
  const keys = await createTestAuditExportKeyProviders();
  return {
    INSECUR_AUDIT_EXPORT_HMAC_SECRET: keys.hmacSecret,
  };
}

/** Secrets Store bindings for in-process RuntimeService composition (e2e / integration). */
export async function testAuditExportRuntimeBindings(): Promise<{
  readonly AUDIT_EXPORT_HMAC_KEY_V1: { get: () => Promise<string> };
  readonly AUDIT_EXPORT_SIGNING_KEY_V1: { get: () => Promise<string> };
}> {
  const keys = await createTestAuditExportKeyProviders();
  const signingMaterial = JSON.stringify({
    keyVersion: keys.signingKey.keyVersion,
    privateKeyPkcs8Base64Url: keys.signingPrivateKeyPkcs8Base64Url,
    publicKeyRawBase64Url: keys.signingPublicKey,
  });
  return {
    AUDIT_EXPORT_HMAC_KEY_V1: {
      get: async () => keys.hmacSecret,
    },
    AUDIT_EXPORT_SIGNING_KEY_V1: {
      get: async () => signingMaterial,
    },
  };
}
