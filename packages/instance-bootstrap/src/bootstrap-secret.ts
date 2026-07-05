import {
  SCRYPT_V1_ALGORITHM,
  hashScryptSecret,
  verifyScryptSecret,
  type ScryptSecretVerifierMaterial,
} from "@insecur/token-signing";

export const BOOTSTRAP_SECRET_ALGORITHM = SCRYPT_V1_ALGORITHM;

export type BootstrapSecretVerifierMaterial = ScryptSecretVerifierMaterial;

export const hashBootstrapSecret = hashScryptSecret;
export const verifyBootstrapSecret = verifyScryptSecret;
