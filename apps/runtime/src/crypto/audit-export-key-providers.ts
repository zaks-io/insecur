import {
  StaticAuditExportHmacKeyProvider,
  StaticAuditExportSigningKeyProvider,
  type AuditExportHmacKeyProvider,
  type AuditExportSigningKeyProvider,
} from "@insecur/audit";
import { base64UrlToBytes } from "@insecur/domain";
import type { SecretsStoreSecretBinding } from "@insecur/crypto";
import type { RuntimeEnv } from "../env.js";
import { AuditExportKeysNotConfiguredError } from "./audit-export-keys-not-configured-error.js";

const DEFAULT_HMAC_CUSTODY_REF = "escrow-record://instance/runtime/audit-hmac/v1";
const DEFAULT_SIGNING_CUSTODY_REF = "escrow-record://instance/runtime/audit-signing/v1";

interface AuditExportSigningKeyMaterial {
  readonly privateKeyPkcs8Base64Url: string;
  readonly publicKeyRawBase64Url: string;
}

function allowsPlaintextAuditExportKeyEnvFallback(env: RuntimeEnv): boolean {
  return env.SENTRY_ENVIRONMENT !== "production";
}

function readEnvString(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

async function readSecretsStoreString(
  binding: SecretsStoreSecretBinding | undefined,
): Promise<string | undefined> {
  if (binding === undefined) {
    return undefined;
  }
  const value = await binding.get();
  return value.trim() === "" ? undefined : value;
}

function parseSigningKeyMaterial(raw: string): AuditExportSigningKeyMaterial {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("audit export signing key material must be JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("audit export signing key material must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  const privateKeyPkcs8Base64Url = record.privateKeyPkcs8Base64Url;
  const publicKeyRawBase64Url = record.publicKeyRawBase64Url;
  if (typeof privateKeyPkcs8Base64Url !== "string" || privateKeyPkcs8Base64Url.length === 0) {
    throw new Error("audit export signing key material is missing privateKeyPkcs8Base64Url");
  }
  if (typeof publicKeyRawBase64Url !== "string" || publicKeyRawBase64Url.length === 0) {
    throw new Error("audit export signing key material is missing publicKeyRawBase64Url");
  }
  return { privateKeyPkcs8Base64Url, publicKeyRawBase64Url };
}

async function resolveHmacSecret(env: RuntimeEnv): Promise<string> {
  const fromBinding = await readSecretsStoreString(env.AUDIT_EXPORT_HMAC_KEY_V1);
  if (fromBinding !== undefined) {
    return fromBinding;
  }
  if (allowsPlaintextAuditExportKeyEnvFallback(env)) {
    const fromEnv = readEnvString("INSECUR_AUDIT_EXPORT_HMAC_SECRET");
    if (fromEnv !== undefined) {
      return fromEnv;
    }
  }
  throw new AuditExportKeysNotConfiguredError();
}

async function resolveSigningKeyMaterial(env: RuntimeEnv): Promise<AuditExportSigningKeyMaterial> {
  const fromBinding = await readSecretsStoreString(env.AUDIT_EXPORT_SIGNING_KEY_V1);
  if (fromBinding !== undefined) {
    return parseSigningKeyMaterial(fromBinding);
  }
  if (allowsPlaintextAuditExportKeyEnvFallback(env)) {
    const privateKeyPkcs8Base64Url = readEnvString(
      "INSECUR_AUDIT_EXPORT_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL",
    );
    const publicKeyRawBase64Url = readEnvString("INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY");
    if (privateKeyPkcs8Base64Url !== undefined && publicKeyRawBase64Url !== undefined) {
      return { privateKeyPkcs8Base64Url, publicKeyRawBase64Url };
    }
  }
  throw new AuditExportKeysNotConfiguredError();
}

export async function resolveAuditExportKeyProviders(env: RuntimeEnv): Promise<{
  readonly hmacKey: AuditExportHmacKeyProvider;
  readonly signingKey: AuditExportSigningKeyProvider;
}> {
  const hmacSecret = await resolveHmacSecret(env);
  const signingMaterial = await resolveSigningKeyMaterial(env);
  const privateKeyPkcs8 = base64UrlToBytes(signingMaterial.privateKeyPkcs8Base64Url);
  const publicKeyRaw = base64UrlToBytes(signingMaterial.publicKeyRawBase64Url);
  if (privateKeyPkcs8 === null || publicKeyRaw === null) {
    throw new Error("audit export signing key material is not valid base64url");
  }

  const [hmacKey, signingKey] = await Promise.all([
    StaticAuditExportHmacKeyProvider.create({
      keyVersion: 1,
      secret: new TextEncoder().encode(hmacSecret),
      custodyEvidenceRef: DEFAULT_HMAC_CUSTODY_REF,
    }),
    StaticAuditExportSigningKeyProvider.fromPkcs8({
      keyVersion: 1,
      privateKeyPkcs8,
      publicKeyRaw,
      custodyEvidenceRef: DEFAULT_SIGNING_CUSTODY_REF,
    }),
  ]);

  return { hmacKey, signingKey };
}
