import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const BOOTSTRAP_SECRET_ALGORITHM = "scrypt_v1" as const;

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

export interface BootstrapSecretVerifierMaterial {
  algorithm: typeof BOOTSTRAP_SECRET_ALGORITHM;
  saltB64: string;
  hashB64: string;
}

export function hashBootstrapSecret(secret: string): BootstrapSecretVerifierMaterial {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return {
    algorithm: BOOTSTRAP_SECRET_ALGORITHM,
    saltB64: salt.toString("base64url"),
    hashB64: hash.toString("base64url"),
  };
}

export function verifyBootstrapSecret(
  secret: string,
  verifier: BootstrapSecretVerifierMaterial,
): boolean {
  let salt: Buffer;
  let expectedHash: Buffer;
  try {
    salt = Buffer.from(verifier.saltB64, "base64url");
    expectedHash = Buffer.from(verifier.hashB64, "base64url");
  } catch {
    return false;
  }

  if (expectedHash.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  const actualHash = scryptSync(secret, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  if (actualHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expectedHash);
}
