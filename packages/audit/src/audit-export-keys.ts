import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";
import { toBufferSource } from "./buffer.js";
import type {
  AuditExportHmacKeyProvider,
  AuditExportSigningKeyProvider,
  AuditExportVerificationKeys,
} from "./audit-export-types.js";

async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function importEd25519PrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", toBufferSource(pkcs8), { name: "Ed25519" }, true, [
    "sign",
  ]);
}

async function importEd25519PublicKey(raw: Uint8Array): Promise<CryptoKey> {
  const spkiPrefix = new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  const spki = new Uint8Array(spkiPrefix.length + raw.length);
  spki.set(spkiPrefix);
  spki.set(raw, spkiPrefix.length);
  return crypto.subtle.importKey("spki", toBufferSource(spki), { name: "Ed25519" }, true, [
    "verify",
  ]);
}

async function generateEd25519KeyPair(): Promise<CryptoKeyPair> {
  const generated = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  if (!("privateKey" in generated)) {
    throw new Error("expected Ed25519 key pair");
  }
  return generated;
}

export class StaticAuditExportHmacKeyProvider implements AuditExportHmacKeyProvider {
  readonly keyVersion: number;
  readonly custodyEvidenceRef: string | null;
  private readonly key: CryptoKey;

  private constructor(keyVersion: number, custodyEvidenceRef: string | null, key: CryptoKey) {
    this.keyVersion = keyVersion;
    this.custodyEvidenceRef = custodyEvidenceRef;
    this.key = key;
  }

  static async create(input: {
    readonly keyVersion: number;
    readonly secret: Uint8Array;
    readonly custodyEvidenceRef?: string | null;
  }): Promise<StaticAuditExportHmacKeyProvider> {
    const key = await importHmacKey(input.secret);
    return new StaticAuditExportHmacKeyProvider(
      input.keyVersion,
      input.custodyEvidenceRef ?? null,
      key,
    );
  }

  async sign(data: Uint8Array): Promise<string> {
    const signature = await crypto.subtle.sign("HMAC", this.key, toBufferSource(data));
    return bytesToBase64Url(new Uint8Array(signature));
  }

  async verify(data: Uint8Array, signature: string): Promise<boolean> {
    const signatureBytes = base64UrlToBytes(signature);
    if (signatureBytes === null) {
      return false;
    }
    return crypto.subtle.verify(
      "HMAC",
      this.key,
      toBufferSource(signatureBytes),
      toBufferSource(data),
    );
  }
}

export class StaticAuditExportSigningKeyProvider implements AuditExportSigningKeyProvider {
  readonly keyVersion: number;
  readonly custodyEvidenceRef: string | null;
  readonly publicKeyBase64Url: string;
  private readonly privateKey: CryptoKey;

  private constructor(
    keyVersion: number,
    custodyEvidenceRef: string | null,
    publicKeyBase64Url: string,
    privateKey: CryptoKey,
  ) {
    this.keyVersion = keyVersion;
    this.custodyEvidenceRef = custodyEvidenceRef;
    this.publicKeyBase64Url = publicKeyBase64Url;
    this.privateKey = privateKey;
  }

  static async generate(input: {
    readonly keyVersion: number;
    readonly custodyEvidenceRef?: string | null;
  }): Promise<StaticAuditExportSigningKeyProvider> {
    const keyPair = await generateEd25519KeyPair();
    const rawPublicKey = await exportEd25519RawPublicKey(keyPair.publicKey);
    return new StaticAuditExportSigningKeyProvider(
      input.keyVersion,
      input.custodyEvidenceRef ?? null,
      bytesToBase64Url(rawPublicKey),
      keyPair.privateKey,
    );
  }

  static async fromPkcs8(input: {
    readonly keyVersion: number;
    readonly privateKeyPkcs8: Uint8Array;
    readonly publicKeyRaw: Uint8Array;
    readonly custodyEvidenceRef?: string | null;
  }): Promise<StaticAuditExportSigningKeyProvider> {
    const privateKey = await importEd25519PrivateKey(input.privateKeyPkcs8);
    return new StaticAuditExportSigningKeyProvider(
      input.keyVersion,
      input.custodyEvidenceRef ?? null,
      bytesToBase64Url(input.publicKeyRaw),
      privateKey,
    );
  }

  async sign(data: Uint8Array): Promise<string> {
    const signature = await crypto.subtle.sign("Ed25519", this.privateKey, toBufferSource(data));
    return bytesToBase64Url(new Uint8Array(signature));
  }
}

export class StaticAuditExportVerificationKeys implements AuditExportVerificationKeys {
  private readonly hmacKeys = new Map<number, AuditExportHmacKeyProvider>();
  private readonly signingPublicKeys = new Map<number, string>();
  private readonly signingCustodyRefs = new Map<number, string | null>();

  registerHmacKey(provider: AuditExportHmacKeyProvider): void {
    this.hmacKeys.set(provider.keyVersion, provider);
  }

  registerSigningKey(provider: AuditExportSigningKeyProvider): void {
    this.signingPublicKeys.set(provider.keyVersion, provider.publicKeyBase64Url);
    this.signingCustodyRefs.set(provider.keyVersion, provider.custodyEvidenceRef);
  }

  getHmacKey(version: number): AuditExportHmacKeyProvider | null {
    return this.hmacKeys.get(version) ?? null;
  }

  getSigningPublicKeyBase64Url(version: number): string | null {
    return this.signingPublicKeys.get(version) ?? null;
  }

  getSigningCustodyEvidenceRef(version: number): string | null {
    return this.signingCustodyRefs.get(version) ?? null;
  }
}

export async function verifyEd25519Signature(input: {
  readonly publicKeyBase64Url: string;
  readonly data: Uint8Array;
  readonly signatureBase64Url: string;
}): Promise<boolean> {
  const publicKeyBytes = base64UrlToBytes(input.publicKeyBase64Url);
  const signatureBytes = base64UrlToBytes(input.signatureBase64Url);
  if (publicKeyBytes === null || signatureBytes === null) {
    return false;
  }
  const publicKey = await importEd25519PublicKey(publicKeyBytes);
  return crypto.subtle.verify(
    "Ed25519",
    publicKey,
    toBufferSource(signatureBytes),
    toBufferSource(input.data),
  );
}

async function exportEd25519RawPublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  return spki.slice(-32);
}
